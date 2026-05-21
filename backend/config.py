from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Which LLM backend to use: "openai" or "gemini"
    llm_provider: str = "openai"

    # IndexTTS
    indextts_api_url: str = "http://localhost:8000"
    # How IndexTTS2 is wrapped: "gradio" (WebUI) or "rest" (REST API)
    indextts_mode: str = "rest"
    # Optional API token for authentication
    indextts_api_token: str = ""

    # Services
    pexels_api_key: str = ""
    pixabay_api_key: str = ""
    youtube_api_key: str = ""
    unsplash_api_key: str = ""
    
    # YouTube Download (yt-dlp)
    youtube_cookies_path: str = ""  # Path to cookies.txt for YouTube authentication

    # Storage
    storage_dir: str = "./storage"

    # Frontend URL (used by backend to fetch frontend-hosted audio files)
    frontend_url: str = "http://localhost:3000"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # App
    app_title: str = "Javis Studio API"
    app_version: str = "0.1.0"
    debug: bool = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
