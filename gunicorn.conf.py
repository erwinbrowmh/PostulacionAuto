# gunicorn.conf.py
import os
import multiprocessing

bind = "0.0.0.0:" + os.environ.get("PORT", "10000")
workers = 2  # Reduced for stability
worker_class = "sync"
timeout = 120  # Increased timeout
graceful_timeout = 30
max_requests = 200
max_requests_jitter = 20
preload_app = True  # Preload for better performance