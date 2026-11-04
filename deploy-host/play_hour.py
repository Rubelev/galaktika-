"""Часовой цикл игры агентов.

Порядок:
  1) восстановление экономики (если у агента тупик: нет денег, но есть товар);
  2) Автопилот — колонист;
  3) Караванщик — торговец;
  4) короткая сводка по трём аккаунтам.

Запуск:  python play_hour.py
Зачем обёртка: без шага 1 агент с 2 862 кредитами и 35 т зерна не может
ни купить, ни выставить лот — цикл вставал.
"""
import json
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable
BASE = "https://warbattleuniverse.com"
CTX = ssl.create_default_context()

AGENTS = [
    ("Автопилот", "agent@warbattleuniverse.com", "GalaktikaAgent2026!"),
    ("Караванщик", "trader@warbattleuniverse.com", "GalaktikaTrader2026!"),
    ("Интендант", "quartermaster@warbattleuniverse.com", "GalaktikaQuarter2026!"),
]


def run(script):
    path = HERE / script
    if not path.exists():
        print(f"нет скрипта {script}")
        return
    print(f"--- {script} ---")
    res = subprocess.run([PY, str(path)], cwd=str(HERE), capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (res.stdout or "").strip().splitlines()
    for line in out[-8:]:
        print("  " + line)
    if res.returncode != 0 and res.stderr:
        print("  stderr: " + res.stderr.strip().splitlines()[-1][:150])


def summary():
    def call(path, payload=None, token=None):
        headers = {"User-Agent": "agent", "Content-Type": "application/json"}
        if token:
            headers["X-Auth-Token"] = token
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(BASE + path, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
            return json.loads(resp.read().decode() or "{}")

    print("--- сводка ---")
    for name, email, password in AGENTS:
        try:
            token = call("/api/auth/login", {"email": email, "password": password}).get("token")
            prof = json.loads(call("/api/auth/me", {}, token).get("profile") or "{}")
            res = prof.get("resources") or {}
            col = prof.get("colony") or {}
            colony = f" | колония {round(col.get('population') or 0)}" if col else " | без колонии"
            print(f"  {name}: {round(float(prof.get('credits') or 0))} кр | "
                  f"зерно {round(res.get('grain') or 0)} | вода {round(res.get('water') or 0)}{colony}")
        except Exception as exc:
            print(f"  {name}: ошибка {exc}")


def main():
    run("play_recover.py")
    run("play_agent.py")
    run("play_trader.py")
    summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
