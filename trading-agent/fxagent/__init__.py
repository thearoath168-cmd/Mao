"""fxagent — forex & gold trend tracking and turning-point alert agent."""
from .analysis import Analysis, Signal, analyze  # noqa: F401
from .agent import TradingAgent, load_config  # noqa: F401
