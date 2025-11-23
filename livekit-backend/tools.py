import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

import httpx
from dotenv import load_dotenv
from livekit.agents import RunContext, ToolError, function_tool, get_job_context

# Load environment for bank API connection (expects MONGODB-backed FastAPI running locally)
load_dotenv(".env.local")

BANK_API_BASE_URL = os.environ.get("BANK_API_BASE_URL", "http://localhost:8000")

logger = logging.getLogger("tools")


@dataclass
class MaskedAccount:
    id: str
    last4: str
    nickname: str
    type: Literal["Salary", "Savings", "Current"]
    balance: Optional[float] = None


def _resolve_session_id() -> str:
    """
    Find the current user's session id so every bank API call is tied to it.
    Sources (in order):
      1) remote participant metadata JSON with "session_id"
      2) room metadata JSON with "session_id"
      3) env BANK_API_SESSION_ID (fallback for local testing)
    """
    job_ctx = get_job_context()
    room = job_ctx.room

    # Check participant metadata first
    for participant in room.remote_participants.values():
        meta = getattr(participant, "metadata", None)
        if meta:
            try:
                meta_json = json.loads(meta)
                if session_id := meta_json.get("session_id"):
                    return session_id
            except Exception:
                logger.debug("Could not parse participant metadata for session_id")

    # Then room metadata
    meta = getattr(room, "metadata", None)
    if meta:
        try:
            meta_json = json.loads(meta)
            if session_id := meta_json.get("session_id"):
                return session_id
        except Exception:
            logger.debug("Could not parse room metadata for session_id")

    # Fallback for local testing
    if env_session := os.environ.get("BANK_API_SESSION_ID"):
        return env_session

    raise ToolError("Session ID missing; cannot call banking API securely.")


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=BANK_API_BASE_URL, timeout=5.0)


@function_tool()
async def list_accounts(context: RunContext) -> List[Dict[str, Any]]:
    """
    List the user's accounts in masked form using the banking API.
    """
    session_id = _resolve_session_id()
    async with _http_client() as client:
        resp = await client.get("/me/accounts", headers={"X-Session-Id": session_id})
    if resp.status_code != 200:
        logger.error("list_accounts failed: %s", resp.text)
        raise ToolError("Unable to load accounts right now.")

    accounts = resp.json()
    masked_accounts: List[Dict[str, Any]] = []
    for acct in accounts:
        acct_number = acct.get("account_number", "")
        masked_accounts.append(
            MaskedAccount(
                id=acct_number,
                last4=acct_number[-4:],
                nickname=acct.get("nickname", ""),
                type=acct.get("account_type", "Savings"),
                balance=None,
            ).__dict__
        )
    return masked_accounts


@function_tool()
async def fetch_balance(context: RunContext) -> Dict[str, Any]:
    """
    Securely fetch the balance for one of the user's accounts using the banking API.
    """
    context.disallow_interruptions()
    job_ctx = get_job_context()
    room = job_ctx.room
    session_id = _resolve_session_id()

    # identify the user participant
    try:
        participant_identity = next(iter(room.remote_participants))
    except StopIteration:
        raise ToolError("No active user participant found in the room.")

    # Load masked accounts from API
    async with _http_client() as client:
        resp = await client.get("/me/accounts", headers={"X-Session-Id": session_id})
    if resp.status_code != 200:
        logger.error("fetch_balance list step failed: %s", resp.text)
        raise ToolError("Unable to load accounts right now.")
    acct_list = resp.json()
    masked_accounts = [
        {
            "id": acct["account_number"],
            "nickname": acct.get("nickname", ""),
            "type": acct.get("account_type", "Savings"),
            "last4": acct["account_number"][-4:],
        }
        for acct in acct_list
    ]

    payload = json.dumps({"accounts": masked_accounts})

    try:
        response = await room.local_participant.perform_rpc(
            destination_identity=participant_identity,
            method="chooseAccount",
            payload=payload,
            response_timeout=60.0,
        )
    except Exception as e:
        logger.exception("RPC chooseAccount failed")
        raise ToolError("Unable to get account selection from the app.")

    try:
        data = json.loads(response)
        account_id = data["accountId"]
    except Exception:
        raise ToolError("Invalid account selection response from the app.")

    async with _http_client() as client:
        resp = await client.get(f"/me/accounts/{account_id}", headers={"X-Session-Id": session_id})
    if resp.status_code != 200:
        logger.error("fetch_balance detail step failed: %s", resp.text)
        raise ToolError("Unable to fetch that account right now.")

    account = resp.json()
    acct_number = account.get("account_number", "")
    return {
        "nickname": account.get("nickname", ""),
        "type": account.get("account_type", ""),
        "last4": acct_number[-4:],
        "balance": account.get("balance"),
        "currency": "INR",
    }


@function_tool()
async def list_recent_transactions(
    ctx: RunContext,
    k: Optional[int] = None,
    direction: Optional[Literal["credit", "debit"]] = None,
    counterparty: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch recent transactions for a chosen account.
    Defaults to the latest 3 entries unless the user explicitly specifies k.
    Optional filters:
      - direction: "credit" or "debit"
      - counterparty: filter by counterparty name/nickname
    """
    ctx.disallow_interruptions()
    job_ctx = get_job_context()
    room = job_ctx.room
    session_id = _resolve_session_id()

    try:
        user_participant = next(iter(room.remote_participants.values()))
    except Exception:
        raise ToolError("No active participants found in the room")

    async with _http_client() as client:
        acct_resp = await client.get("/me/accounts", headers={"X-Session-Id": session_id})
    if acct_resp.status_code != 200:
        raise ToolError("Unable to load your accounts right now.")
    acct_list = acct_resp.json()
    masked_accounts = [
        {
            "id": acct["account_number"],
            "nickname": acct.get("nickname", ""),
            "type": acct.get("account_type", "Savings"),
            "last4": acct["account_number"][-4:],
        }
        for acct in acct_list
    ]

    try:
        source_resp = await room.local_participant.perform_rpc(
            destination_identity=user_participant.identity,
            method="chooseAccount",
            payload=json.dumps({"accounts": masked_accounts, "prompt": "Choose account to review transactions"}),
            response_timeout=60.0,
        )
    except Exception:
        raise ToolError("I couldn't get the account selection.")

    try:
        source_data = json.loads(source_resp)
        account_id = source_data["accountId"]
    except Exception:
        raise ToolError("Invalid account selection.")

    limit = k if isinstance(k, int) and k > 0 else 3
    params: Dict[str, Any] = {"limit": limit}
    if direction:
        params["direction"] = direction
    if counterparty:
        params["counterparty"] = counterparty

    async with _http_client() as client:
        resp = await client.get(
            f"/me/accounts/{account_id}/transactions", headers={"X-Session-Id": session_id}, params=params
        )
    if resp.status_code != 200:
        try:
            message = resp.json().get("detail", resp.text)
        except Exception:
            message = resp.text
        raise ToolError(f"Unable to fetch transactions: {message}")

    transactions = resp.json()
    return {
        "account_id": account_id,
        "count": len(transactions),
        "limit": limit,
        "direction": direction,
        "counterparty": counterparty,
        "transactions": transactions,
    }

@function_tool()
async def initiate_transfer(ctx: RunContext, amount: float, payee_nickname: Optional[str] = "") -> Dict[str, Any]:
    """
    Start a money transfer that will be completed after PIN Verification

    The assistant will:
        - Confirm the amount & payee with the user
        - Ask for PIN via the app (never via voice)
        - Complete the transfer after the PIN is validated
    """

    ctx.disallow_interruptions()
    job_context = get_job_context()
    room = job_context.room

    try:
        user_participant = next(iter(room.remote_participants.values()))
    except:
        raise ToolError("No active participants found in the room")

    session_id = _resolve_session_id()

    # Get payee_acc_no by requesting payee account number from the user in the frontend
    try:
        payee_acc_no_resp = await room.local_participant.perform_rpc(
            destination_identity=user_participant.identity,
            method="requestPayeeAccNo",
            payload=f"Please enter {payee_nickname}'s account number",
            response_timeout=60.0
        )
    except Exception:
        raise ToolError("I couldn't recieve the payee account number")

    payee_acc_data = json.loads(payee_acc_no_resp)
    payee_acc_no = payee_acc_data["accountNumber"]

    if payee_acc_no == -1:
        raise ToolError("Cancelled the transaction")

    # Ask user to pick source account
    async with _http_client() as client:
        acct_resp = await client.get("/me/accounts", headers={"X-Session-Id": session_id})
    if acct_resp.status_code != 200:
        raise ToolError("Unable to load your accounts right now.")
    acct_list = acct_resp.json()
    masked_accounts = [
        {
            "id": acct["account_number"],
            "nickname": acct.get("nickname", ""),
            "type": acct.get("account_type", "Savings"),
            "last4": acct["account_number"][-4:],
        }
        for acct in acct_list
    ]
    try:
        source_resp = await room.local_participant.perform_rpc(
            destination_identity=user_participant.identity,
            method="chooseAccount",
            payload=json.dumps({"accounts": masked_accounts, "prompt": "Choose the source account"}),
            response_timeout=60.0,
        )
    except Exception:
        raise ToolError("I couldn't get the source account selection.")

    try:
        source_data = json.loads(source_resp)
        source_account = source_data["accountId"]
    except Exception:
        raise ToolError("Invalid source account selection.")
    
    if source_account == -1:
        raise ToolError("Cancelled the transaction")

    # Request transaction PIN from frontend (never via voice)
    try:
        tpin_resp = await room.local_participant.perform_rpc(
            destination_identity=user_participant.identity,
            method="requestTpin",
            payload="Enter your 4-digit transaction PIN",
            response_timeout=60.0,
        )
        tpin_data = json.loads(tpin_resp)
        tpin = str(tpin_data.get("tpin", "")).strip()
        if len(tpin) != 4 or not tpin.isdigit():
            raise ToolError("Invalid transaction PIN format.")
    except ToolError:
        raise
    except Exception:
        raise ToolError("I couldn't receive the transaction PIN.")
    
    if tpin == -1:
        raise ToolError("Cancelled the transaction.")

    # Create a pending transfer
    async with _http_client() as client:
        resp = await client.post(
            "/me/transfers",
            json={
                "source_account_number": source_account,
                "payee_account_number": payee_acc_no,
                "payee_name": payee_nickname,
                "amount": amount,
                "tpin": tpin,
            },
            headers={"X-Session-Id": session_id},
        )

    if resp.status_code != 200:
        try:
            body = resp.json()
            message = body.get("detail") or body.get("message") or resp.text
        except Exception:
            message = resp.text
        raise ToolError(f"Transfer failed: {message}")

    result = resp.json()
    return {
        "status": "success",
        "amount": result.get("amount"),
        "currency": result.get("currency", "INR"),
        "source_last4": result.get("source_last4"),
        "payee_last4": result.get("payee_last4"),
        "source_nickname": result.get("source_nickname"),
        "payee_nickname": result.get("payee_nickname"),
        "new_source_balance": result.get("new_source_balance"),
    }


@function_tool()
async def list_loan_options(ctx: RunContext) -> Dict[str, Any]:
    """
    Provide hardcoded loan products with indicative interest rates.
    """
    options = [
        {"name": "Home Loan", "interest_rate_annual_percent": 8.5, "tenure_range_months": [60, 360]},
        {"name": "Personal Loan", "interest_rate_annual_percent": 12.9, "tenure_range_months": [12, 60]},
        {"name": "Auto Loan", "interest_rate_annual_percent": 9.75, "tenure_range_months": [12, 84]},
        {"name": "Education Loan", "interest_rate_annual_percent": 9.2, "tenure_range_months": [24, 120]},
    ]
    return {"products": options, "currency": "INR"}


@function_tool()
async def calculate_emi(
    ctx: RunContext,
    principal: float,
    annual_rate_percent: float,
    tenure_months: int,
) -> Dict[str, Any]:
    """
    Calculate approximate EMI for a loan.
    Args:
      principal: loan amount
      annual_rate_percent: annual interest rate in percent
      tenure_months: repayment tenure in months
    """
    if principal <= 0:
        raise ToolError("Loan amount must be greater than zero.")
    if tenure_months <= 0:
        raise ToolError("Tenure must be greater than zero.")
    if annual_rate_percent < 0:
        raise ToolError("Interest rate cannot be negative.")

    monthly_rate = annual_rate_percent / 1200.0
    n = tenure_months

    if monthly_rate == 0:
        emi = principal / n
    else:
        emi = principal * monthly_rate * (1 + monthly_rate) ** n / ((1 + monthly_rate) ** n - 1)

    total_payment = emi * n
    total_interest = total_payment - principal

    return {
        "principal": principal,
        "annual_rate_percent": annual_rate_percent,
        "tenure_months": tenure_months,
        "monthly_rate": monthly_rate,
        "emi": round(emi, 2),
        "total_payment": round(total_payment, 2),
        "total_interest": round(total_interest, 2),
        "currency": "INR",
    }


@function_tool()
async def get_user_name(ctx: RunContext) -> Dict[str, Any]:
    """
    Fetch the signed-in user's name from the banking API using the current session.
    """
    session_id = _resolve_session_id()
    async with _http_client() as client:
        resp = await client.get("/me/customer", headers={"X-Session-Id": session_id})
    if resp.status_code != 200:
        try:
            message = resp.json().get("detail", resp.text)
        except Exception:
            message = resp.text
        raise ToolError(f"Unable to fetch your profile: {message}")

    customer = resp.json()
    return {"name": customer.get("name", ""), "customer_id": customer.get("customer_id")}
