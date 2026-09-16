import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL                  = os.getenv("DATABASE_URL")
SECRET_KEY                    = os.getenv("SECRET_KEY")
ALGORITHM                     = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES   = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES",  "43200"))
REFRESH_TOKEN_EXPIRE_MINUTES  = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", "129600"))
PATIENT_SESSION_EXPIRE_MINUTES = int(os.getenv("PATIENT_SESSION_EXPIRE_MINUTES", "480"))

# Deepgram
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# Gemini (used by LangChain for summarisation)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Groq (used as fallback for summarisation)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Cloudinary
CLOUDINARY_CLOUD_NAME  = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY     = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET  = os.getenv("CLOUDINARY_API_SECRET", "")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is missing in .env")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is missing in .env")

# Email (SMTP) — for family visit notifications
SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")   # your Gmail address
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")   # Gmail App Password
SMTP_FROM     = os.getenv("SMTP_FROM",     SMTP_USER)
