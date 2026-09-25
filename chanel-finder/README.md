# Chanel Finder — Sunday NFL on YouTube TV

The shareable site lives in `web/` (Channel Finder). This folder is the original Boise / Spirit Lake CLI, and `export_web.py` feeds the site’s coverage maps.

Tell me which **Boise, ID** and **Spirit Lake, IA** YouTube TV locals carry which NFL games this week, with the **49ers** highlighted.

## Setup (Python 3.14)

```bash
cd chanel-finder
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python sunday_tv.py              # current NFL week
python sunday_tv.py --week 3     # specific week
python sunday_tv.py --year 2026 --week 3
```

## How it works

1. **ESPN** — kickoff times and full weekly slate  
2. **506sports** — unofficial FOX/CBS coverage maps (color-coded by market)  
3. Samples Boise + Spirit Lake on those maps → local affiliate (KNIN/KBOI or KPTH/KMEG, etc.)

NBC / ESPN / Prime / Netflix national games are listed for both markets.

> 506sports listings are unofficial and can change. Always double-check the YouTube TV guide on game day.
