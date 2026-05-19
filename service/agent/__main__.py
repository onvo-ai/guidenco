import argparse
from . import run
from tools.send_keyboard_events_usb import cleanup as usb_cleanup


def main():
    import sys
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(message)s',
        handlers=[logging.StreamHandler(sys.stdout)]
    )

    parser = argparse.ArgumentParser(description="Guidenco — vision-driven remote desktop automation")
    parser.add_argument("goal", help="The goal to accomplish")
    args = parser.parse_args()

    try:
        run(args.goal)
    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        try:
            usb_cleanup()
        except Exception:
            pass


if __name__ == "__main__":
    main()