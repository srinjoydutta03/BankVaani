from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentServer,AgentSession, Agent, room_io
from livekit.plugins import noise_cancellation, silero, sarvam, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from prompt import AGENT_INSTRUCTIONS, SESSION_INSTRUCTIONS
from tools import list_accounts, fetch_balance, initiate_transfer, list_recent_transactions, list_loan_options, calculate_emi, get_user_name

load_dotenv(".env.local")

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=AGENT_INSTRUCTIONS,
            tools=[list_accounts, fetch_balance, initiate_transfer, list_recent_transactions, list_loan_options, calculate_emi, get_user_name],
        )

server = AgentServer()

@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    session = AgentSession(
        stt=sarvam.STT(
            model="saarika:v2.5",
        ),
        llm="openai/gpt-4.1-mini",
        tts=elevenlabs.TTS(
            voice_id="RXe6OFmxoC0nlSWpuCDy",
            model="eleven_flash_v2_5"
        ),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
        use_tts_aligned_transcript=True,
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony() if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP else noise_cancellation.BVC(),
            ),
        ),
    )

    await session.generate_reply(
        instructions=SESSION_INSTRUCTIONS
    )


if __name__ == "__main__":
    agents.cli.run_app(server)