"""guidenco-client — CLI entry point."""
import argparse
import logging


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="guidenco-client")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("init", help="Pair with the cloud and start the client")
    sub.add_parser("run", help="Run the client using saved config")
    p.parse_args()
    raise SystemExit("Not yet implemented — coming in a later task.")


if __name__ == "__main__":
    main()
