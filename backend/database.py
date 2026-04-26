"""
database.py
SQLAlchemy async database setup for SQLite (city_wallet.db).
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///./city_wallet.db"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class OfferEvent(Base):
    __tablename__ = "offer_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String, index=True, nullable=False)
    session_id = Column(String, nullable=False)
    context_state = Column(String, nullable=False)
    offer_archetype = Column(String, nullable=True)
    headline = Column(Text, nullable=True)
    sub_copy = Column(Text, nullable=True)
    discount_pct = Column(Integer, nullable=True)
    discount_label = Column(String, nullable=True)
    emotional_frame = Column(String, nullable=True)
    expiry_minutes = Column(Integer, nullable=True)
    category_keyword = Column(String, nullable=True)
    cta_text = Column(String, nullable=True)
    status = Column(String, default="generated")  # generated | accepted | redeemed
    redemption_token = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    redeemed_at = Column(DateTime, nullable=True)


async def init_db():
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency: yield an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
