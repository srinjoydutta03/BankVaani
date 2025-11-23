from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from typing import Literal, Any
import logging
import bcrypt

from fastapi import Depends, FastAPI, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv(".env.local")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("bank_api")
app = FastAPI(title="Voice Banking Backend", version="0.1.0")


class Settings(BaseModel):
    mongodb_uri: str = Field(default_factory=lambda: os.environ["MONGODB_URI"])
    mongodb_db: str = Field(default_factory=lambda: os.environ.get("MONGODB_DB", "voicebank"))
    session_ttl_minutes: int = 60 * 24


settings = Settings()


# ---------- Pydantic models ----------
class UserCreate(BaseModel):
    user_id: str = Field(min_length=3)
    password: str = Field(min_length=8)
    name: str
    customer_id: str


class LoginRequest(BaseModel):
    user_id: str
    password: str


class SessionInfo(BaseModel):
    session_id: str
    expires_at: datetime


class BankCustomer(BaseModel):
    customer_id: str
    name: str
    account_numbers: list[str] = Field(default_factory=list)


class AccountCreate(BaseModel):
    account_number: str
    nickname: str
    account_type: Literal["Salary", "Savings", "Current"]
    balance: float = Field(ge=0)
    tpin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")


class AccountOut(BaseModel):
    account_number: str
    nickname: str
    account_type: Literal["Salary", "Savings", "Current"]
    balance: float
    customer_id: str


class TransferRequest(BaseModel):
    source_account_number: str
    payee_account_number: str
    payee_name: str | None = None
    amount: float = Field(gt=0)
    tpin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")


class TransferResult(BaseModel):
    status: str
    amount: float
    currency: str = "INR"
    source_last4: str
    payee_last4: str
    source_nickname: str | None = None
    payee_nickname: str | None = None
    new_source_balance: float | None = None


class TransactionOut(BaseModel):
    transaction_id: str
    account_number: str
    direction: Literal["credit", "debit"]
    amount: float
    counterparty: str | None = None
    counterparty_account: str | None = None
    description: str | None = None
    created_at: datetime
    balance_after: float | None = None


# ---------- Utilities ----------
async def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Database not initialized")
    return db


def hash_password(raw: str) -> str:
    raw_bytes = raw.encode("utf-8")
    hashed = bcrypt.hashpw(raw_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def require_session(
    request: Request, db: AsyncIOMotorDatabase = Depends(get_db)
) -> dict:
    session_id = request.headers.get("X-Session-Id")
    if not session_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing session id")

    session = await db.sessions.find_one(
        {"session_id": session_id, "active": True, "expires_at": {"$gt": datetime.utcnow()}}
    )
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    user = await db.users.find_one({"user_id": session["user_id"]})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found for session")

    request.state.session_id = session_id
    return user


# ---------- Lifecycle ----------
@app.on_event("startup")
async def startup() -> None:
    app.state.mongo_client = AsyncIOMotorClient(settings.mongodb_uri)
    app.state.db = app.state.mongo_client[settings.mongodb_db]
    await ensure_indexes(app.state.db)
    # Uncomment to seed demo data locally
    # await seed_sample_data(app.state.db)
    logger.info("Connected to MongoDB, ensured indexes, and seeded data")


@app.on_event("shutdown")
async def shutdown() -> None:
    if client := getattr(app.state, "mongo_client", None):
        client.close()
        logger.info("Closed MongoDB client")


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create key indexes and uniqueness constraints."""
    await db.users.create_index("user_id", unique=True)
    await db.customers.create_index("customer_id", unique=True)
    await db.accounts.create_index("account_number", unique=True)
    await db.transactions.create_index(
        [("account_number", 1), ("created_at", -1)], name="account_createdAt"
    )
    await db.sessions.create_index(
        [("session_id", 1), ("active", 1), ("expires_at", 1)],
        name="session_validity",
    )


async def seed_sample_data(db: AsyncIOMotorDatabase) -> None:
    """Insert richer mock data for testing (users, customers, accounts)."""
    seed_password = "P@ssword123"
    # Transaction PINs: Srinjoy 0001, Sujal 0002, Mariam 0003, Bibhuti 0004
    # seed_users = [
    #     {"user_id": "srinjoy", "name": "Srinjoy Dutta", "customer_id": "cust_1001"},
    #     {"user_id": "sujal", "name": "Sujal Kyal", "customer_id": "cust_1002"},
    #     {"user_id": "mariam", "name": "Mariam Malik", "customer_id": "cust_1003"},
    #     {"user_id": "bibhuti", "name": "Bibhuti Jha", "customer_id": "cust_1004"},
    # ]

    seed_customers = {
        "cust_1001": {
            "customer_id": "cust_1001",
            "name": "Srinjoy Dutta",
            "account_numbers": ["11112222", "11113333"],
        },
        "cust_1002": {
            "customer_id": "cust_1002",
            "name": "Sujal Kyal",
            "account_numbers": ["22223333"],
        },
        "cust_1003": {
            "customer_id": "cust_1003",
            "name": "Mariam Malik",
            "account_numbers": ["33334444", "33335555", "33336666"],
        },
        "cust_1004": {
            "customer_id": "cust_1004",
            "name": "Bibhuti Jha",
            "account_numbers": ["44445555"],
        },
    }

    seed_accounts = [
        # Srinjoy: salary + savings
        {
            "account_number": "11112222",
            "nickname": "Salary",
            "account_type": "Salary",
            "balance": 125000.25,
            "customer_id": "cust_1001",
            "transaction_pin_hash": hash_password("0001"),
        },
        {
            "account_number": "11113333",
            "nickname": "Rainy Day",
            "account_type": "Savings",
            "balance": 45230.80,
            "customer_id": "cust_1001",
            "transaction_pin_hash": hash_password("0001"),
        },
        # Sujal: current only
        {
            "account_number": "22223333",
            "nickname": "Business Ops",
            "account_type": "Current",
            "balance": 802345.10,
            "customer_id": "cust_1002",
            "transaction_pin_hash": hash_password("0002"),
        },
        # Mariam: salary + savings + current
        {
            "account_number": "33334444",
            "nickname": "Payroll",
            "account_type": "Salary",
            "balance": 98765.43,
            "customer_id": "cust_1003",
            "transaction_pin_hash": hash_password("0003"),
        },
        {
            "account_number": "33335555",
            "nickname": "Invest",
            "account_type": "Savings",
            "balance": 1500000.00,
            "customer_id": "cust_1003",
            "transaction_pin_hash": hash_password("0003"),
        },
        {
            "account_number": "33336666",
            "nickname": "Consulting",
            "account_type": "Current",
            "balance": 30500.75,
            "customer_id": "cust_1003",
            "transaction_pin_hash": hash_password("0003"),
        },
        # Bibhuti: current
        {
            "account_number": "44445555",
            "nickname": "Marketplace",
            "account_type": "Current",
            "balance": 210450.60,
            "customer_id": "cust_1004",
            "transaction_pin_hash": hash_password("0004"),
        },
    ]
    # seed_transactions = [
    #     # Srinjoy accounts
    #     {
    #         "transaction_id": "tx_001",
    #         "account_number": "11112222",
    #         "direction": "credit",
    #         "amount": 50000.00,
    #         "counterparty": "Acme Corp",
    #         "counterparty_account": "99XX1234",
    #         "description": "Monthly salary",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 125000.25,
    #     },
    #     {
    #         "transaction_id": "tx_002",
    #         "account_number": "11112222",
    #         "direction": "debit",
    #         "amount": 1500.00,
    #         "counterparty": "MetroMart",
    #         "counterparty_account": None,
    #         "description": "Groceries",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 123500.25,
    #     },
    #     {
    #         "transaction_id": "tx_003",
    #         "account_number": "11113333",
    #         "direction": "credit",
    #         "amount": 10000.00,
    #         "counterparty": "FD Interest",
    #         "counterparty_account": None,
    #         "description": "Interest payout",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 45230.80,
    #     },
    #     # Sujal
    #     {
    #         "transaction_id": "tx_004",
    #         "account_number": "22223333",
    #         "direction": "debit",
    #         "amount": 25000.00,
    #         "counterparty": "VendorPay",
    #         "counterparty_account": "77XX9988",
    #         "description": "Supplier payment",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 777345.10,
    #     },
    #     {
    #         "transaction_id": "tx_005",
    #         "account_number": "22223333",
    #         "direction": "credit",
    #         "amount": 100000.00,
    #         "counterparty": "Client ABC",
    #         "counterparty_account": "66XX4455",
    #         "description": "Invoice payout",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 802345.10,
    #     },
    #     # Mariam
    #     {
    #         "transaction_id": "tx_006",
    #         "account_number": "33335555",
    #         "direction": "debit",
    #         "amount": 50000.00,
    #         "counterparty": "Mutual Fund",
    #         "counterparty_account": None,
    #         "description": "Investment SIP",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 1450000.00,
    #     },
    #     {
    #         "transaction_id": "tx_007",
    #         "account_number": "33334444",
    #         "direction": "credit",
    #         "amount": 90000.00,
    #         "counterparty": "Acme Corp",
    #         "counterparty_account": "99XX1234",
    #         "description": "Payroll",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 98765.43,
    #     },
    #     # Bibhuti
    #     {
    #         "transaction_id": "tx_008",
    #         "account_number": "44445555",
    #         "direction": "debit",
    #         "amount": 15000.00,
    #         "counterparty": "Courier Express",
    #         "counterparty_account": None,
    #         "description": "Logistics",
    #         "created_at": datetime.utcnow(),
    #         "balance_after": 195450.60,
    #     },
    # ]

    for cust in seed_customers.values():
        existing = await db.customers.find_one({"customer_id": cust["customer_id"]})
        if not existing:
            await db.customers.insert_one(cust)
            logger.info("Inserted sample customer %s", cust["customer_id"])

    for acct in seed_accounts:
        acct_existing = await db.accounts.find_one({"account_number": acct["account_number"]})
        if not acct_existing:
            await db.accounts.insert_one(acct)
            logger.info("Inserted sample account %s", acct["account_number"])
        await db.customers.update_one(
            {"customer_id": acct["customer_id"]},
            {"$addToSet": {"account_numbers": acct["account_number"]}},
            upsert=True,
        )

    # for txn in seed_transactions:
    #     txn_existing = await db.transactions.find_one({"transaction_id": txn["transaction_id"]})
    #     if not txn_existing:
    #         await db.transactions.insert_one(txn)
    #         logger.info("Inserted sample transaction %s", txn["transaction_id"])

    # for user in seed_users:
    #     user_existing = await db.users.find_one({"user_id": user["user_id"]})
    #     if not user_existing:
    #         await db.users.insert_one(
    #             {
    #                 "user_id": user["user_id"],
    #                 "password_hash": hash_password(seed_password),
    #                 "name": user["name"],
    #                 "customer_id": user["customer_id"],
    #                 "created_at": datetime.utcnow(),
    #             }
    #         )
    #         logger.info("Inserted sample user %s (customer %s)", user["user_id"], user["customer_id"])
    # for user in seed_users:
    #     user_existing = await db.users.find_one({"user_id": user["user_id"]})
    #     if not user_existing:
    #         await db.users.insert_one(
    #             {
    #                 "user_id": user["user_id"],
    #                 "password_hash": hash_password(seed_password),
    #                 "name": user["name"],
    #                 "customer_id": user["customer_id"],
    #                 "created_at": datetime.utcnow(),
    #             }
    #         )
    #         logger.info("Inserted sample user %s (customer %s)", user["user_id"], user["customer_id"])

# ---------- Auth routes ----------
@app.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    if await db.users.find_one({"user_id": payload.user_id}):
        raise HTTPException(status.HTTP_409_CONFLICT, "User already exists")

    user_doc = {
        "user_id": payload.user_id,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "customer_id": payload.customer_id,
        "created_at": datetime.utcnow(),
    }
    await db.users.insert_one(user_doc)

    await db.customers.update_one(
        {"customer_id": payload.customer_id},
        {"$setOnInsert": {"customer_id": payload.customer_id, "name": payload.name, "account_numbers": []}},
        upsert=True,
    )
    return {"status": "ok", "user_id": payload.user_id}


@app.post("/login", response_model=SessionInfo)
async def login(payload: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)) -> SessionInfo:
    user = await db.users.find_one({"user_id": payload.user_id})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    expires_at = datetime.utcnow() + timedelta(minutes=settings.session_ttl_minutes)
    session_id = str(uuid.uuid4())
    await db.sessions.insert_one(
        {
            "session_id": session_id,
            "user_id": user["user_id"],
            "created_at": datetime.utcnow(),
            "expires_at": expires_at,
            "active": True,
        }
    )
    return SessionInfo(session_id=session_id, expires_at=expires_at)


@app.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    user: dict = Depends(require_session),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> None:
    session_id = getattr(request.state, "session_id", None)
    if session_id:
        await db.sessions.update_one({"session_id": session_id}, {"$set": {"active": False}})


# ---------- Banking routes ----------
@app.get("/me/customer", response_model=BankCustomer)
async def get_customer(
    user: dict = Depends(require_session), db: AsyncIOMotorDatabase = Depends(get_db)
) -> BankCustomer:
    customer = await db.customers.find_one({"customer_id": user["customer_id"]})
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return BankCustomer(**customer)


@app.get("/me/accounts", response_model=list[AccountOut])
async def list_accounts_for_user(
    user: dict = Depends(require_session), db: AsyncIOMotorDatabase = Depends(get_db)
) -> list[AccountOut]:
    customer = await db.customers.find_one({"customer_id": user["customer_id"]})
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    accounts = (
        await db.accounts.find({"account_number": {"$in": customer.get("account_numbers", [])}})
        .to_list(length=100)
    )
    return [AccountOut(**acct) for acct in accounts]


@app.post("/me/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate,
    user: dict = Depends(require_session),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AccountOut:
    if await db.accounts.find_one({"account_number": payload.account_number}):
        raise HTTPException(status.HTTP_409_CONFLICT, "Account already exists")

    account_doc = payload.dict()
    account_doc["customer_id"] = user["customer_id"]
    account_doc["transaction_pin_hash"] = hash_password(payload.tpin)
    account_doc.pop("tpin", None)
    await db.accounts.insert_one(account_doc)

    await db.customers.update_one(
        {"customer_id": user["customer_id"]},
        {"$addToSet": {"account_numbers": payload.account_number}},
        upsert=True,
    )
    return AccountOut(**account_doc)


@app.get("/me/accounts/{account_number}", response_model=AccountOut)
async def get_account(
    account_number: str,
    user: dict = Depends(require_session),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AccountOut:
    account = await db.accounts.find_one(
        {"account_number": account_number, "customer_id": user["customer_id"]}
    )
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    return AccountOut(**account)


@app.get("/me/accounts/{account_number}/transactions", response_model=list[TransactionOut])
async def list_transactions(
    account_number: str,
    limit: int = 3,
    direction: Literal["credit", "debit"] | None = None,
    counterparty: str | None = None,
    user: dict = Depends(require_session),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[TransactionOut]:
    if limit <= 0:
        limit = 3

    # ensure account belongs to caller
    account = await db.accounts.find_one(
        {"account_number": account_number, "customer_id": user["customer_id"]}
    )
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    query: dict[str, Any] = {"account_number": account_number}
    if direction:
        query["direction"] = direction
    if counterparty:
        query["counterparty"] = counterparty

    docs = (
        await db.transactions.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    )
    return [TransactionOut(**doc) for doc in docs]


@app.post("/me/transfers", response_model=TransferResult)
async def transfer_funds(
    payload: TransferRequest,
    user: dict = Depends(require_session),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TransferResult:
    # Ensure source account belongs to caller
    source = await db.accounts.find_one(
        {"account_number": payload.source_account_number, "customer_id": user["customer_id"]}
    )
    if not source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source account not found")
    if not source.get("transaction_pin_hash"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source account is missing a transaction PIN")
    if not verify_password(payload.tpin, source["transaction_pin_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid transaction PIN")

    # Ensure payee account exists (can belong to any customer)
    payee = await db.accounts.find_one({"account_number": payload.payee_account_number})
    if not payee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payee account not found")

    if payload.amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount must be greater than zero")

    # Debit with balance guard
    debit_res = await db.accounts.update_one(
        {
            "account_number": payload.source_account_number,
            "customer_id": user["customer_id"],
            "balance": {"$gte": payload.amount},
        },
        {"$inc": {"balance": -payload.amount}},
    )
    if debit_res.modified_count == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient funds")

    # Credit payee; if it fails, refund the debit
    credit_res = await db.accounts.update_one(
        {"account_number": payload.payee_account_number},
        {"$inc": {"balance": payload.amount}},
    )
    if credit_res.modified_count == 0:
        await db.accounts.update_one(
            {"account_number": payload.source_account_number, "customer_id": user["customer_id"]},
            {"$inc": {"balance": payload.amount}},
        )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to credit payee")

    # Fetch updated source balance for confirmation
    updated_source = await db.accounts.find_one(
        {"account_number": payload.source_account_number, "customer_id": user["customer_id"]}
    )
    updated_payee = await db.accounts.find_one({"account_number": payload.payee_account_number})

    # Record transactions for both sides
    now = datetime.utcnow()
    source_txn = {
        "transaction_id": str(uuid.uuid4()),
        "account_number": payload.source_account_number,
        "direction": "debit",
        "amount": payload.amount,
        "counterparty": payload.payee_name,
        "counterparty_account": payload.payee_account_number[-4:],
        "description": f"Transfer to {payload.payee_name or 'payee'}",
        "created_at": now,
        "balance_after": updated_source.get("balance") if updated_source else None,
        "customer_id": user["customer_id"],
    }
    payee_txn = {
        "transaction_id": str(uuid.uuid4()),
        "account_number": payload.payee_account_number,
        "direction": "credit",
        "amount": payload.amount,
        "counterparty": user.get("name"),
        "counterparty_account": payload.source_account_number[-4:],
        "description": f"Transfer from {user.get('name')}",
        "created_at": now,
        "balance_after": updated_payee.get("balance") if updated_payee else None,
        "customer_id": updated_payee.get("customer_id") if updated_payee else None,
    }
    try:
        await db.transactions.insert_many([source_txn, payee_txn])
    except Exception:
        logger.exception("Failed to record transaction entries")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Transfer recorded but logging failed")

    return TransferResult(
        status="success",
        amount=payload.amount,
        currency="INR",
        source_last4=str(payload.source_account_number)[-4:],
        payee_last4=str(payload.payee_account_number)[-4:],
        source_nickname=source.get("nickname"),
        payee_nickname=payee.get("nickname"),
        new_source_balance=updated_source.get("balance") if updated_source else None,
    )
