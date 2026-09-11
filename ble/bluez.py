"""
ble/bluez.py — the BlueZ D-Bus plumbing behind SetupService.

BlueZ has no Python binding of its own: a peripheral is built by exporting
objects on the system bus that implement org.bluez.GattService1,
GattCharacteristic1 and LEAdvertisement1, then handing them to BlueZ to
register. That is what this file does and nothing else — the behaviour lives in
service.py, which has no D-Bus in it and can be tested without Bluetooth.

Needs python3-dbus and python3-gi (apt). Importing it without them raises
ImportError, which SetupService catches and reports.
"""

import logging

import dbus
import dbus.exceptions
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib

from .service import (
    NETWORKS_UUID, SCAN_UUID, SERVICE_UUID, STATUS_UUID, WIFI_UUID,
)

logger = logging.getLogger("guidenco.ble")

BLUEZ = "org.bluez"
ADAPTER_IFACE = "org.bluez.Adapter1"
GATT_MANAGER_IFACE = "org.bluez.GattManager1"
LE_ADVERTISING_MANAGER_IFACE = "org.bluez.LEAdvertisingManager1"
DBUS_OM_IFACE = "org.freedesktop.DBus.ObjectManager"
DBUS_PROP_IFACE = "org.freedesktop.DBus.Properties"

BASE_PATH = "/org/guidenco"


class InvalidArgsException(dbus.exceptions.DBusException):
    _dbus_error_name = "org.freedesktop.DBus.Error.InvalidArgs"


class NotSupportedException(dbus.exceptions.DBusException):
    _dbus_error_name = "org.bluez.Error.NotSupported"


# ── GATT objects ──────────────────────────────────────────────────────────────

class Characteristic(dbus.service.Object):
    IFACE = "org.bluez.GattCharacteristic1"

    def __init__(self, bus, index, uuid, flags, service):
        self.path = f"{service.path}/char{index}"
        self.uuid = uuid
        self.flags = flags
        self.service = service
        self.notifying = False
        super().__init__(bus, self.path)

    def get_properties(self):
        return {self.IFACE: {
            "Service": self.service.get_path(),
            "UUID": self.uuid,
            "Flags": self.flags,
        }}

    def get_path(self):
        return dbus.ObjectPath(self.path)

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != self.IFACE:
            raise InvalidArgsException()
        return self.get_properties()[self.IFACE]

    @dbus.service.method(IFACE, in_signature="a{sv}", out_signature="ay")
    def ReadValue(self, options):
        raise NotSupportedException()

    @dbus.service.method(IFACE, in_signature="aya{sv}")
    def WriteValue(self, value, options):
        raise NotSupportedException()

    @dbus.service.method(IFACE)
    def StartNotify(self):
        self.notifying = True

    @dbus.service.method(IFACE)
    def StopNotify(self):
        self.notifying = False

    @dbus.service.signal(DBUS_PROP_IFACE, signature="sa{sv}as")
    def PropertiesChanged(self, interface, changed, invalidated):
        pass

    def notify(self, payload: bytes) -> None:
        if not self.notifying:
            return
        self.PropertiesChanged(
            self.IFACE, {"Value": dbus.Array([dbus.Byte(b) for b in payload], signature="y")}, [])


class StatusCharacteristic(Characteristic):
    def __init__(self, bus, index, service, setup):
        super().__init__(bus, index, STATUS_UUID, ["read", "notify"], service)
        self.setup = setup
        setup._notify = self.notify

    @dbus.service.method(Characteristic.IFACE, in_signature="a{sv}", out_signature="ay")
    def ReadValue(self, options):
        return [dbus.Byte(b) for b in self.setup.status_payload()]


class NetworksCharacteristic(Characteristic):
    def __init__(self, bus, index, service, setup):
        super().__init__(bus, index, NETWORKS_UUID, ["read"], service)
        self.setup = setup

    @dbus.service.method(Characteristic.IFACE, in_signature="a{sv}", out_signature="ay")
    def ReadValue(self, options):
        return [dbus.Byte(b) for b in self.setup.networks_payload()]


class ScanCharacteristic(Characteristic):
    def __init__(self, bus, index, service, setup):
        super().__init__(bus, index, SCAN_UUID, ["write", "write-without-response"], service)
        self.setup = setup

    @dbus.service.method(Characteristic.IFACE, in_signature="aya{sv}")
    def WriteValue(self, value, options):
        self.setup.handle_scan(bytes(bytearray(value)))


class WifiCharacteristic(Characteristic):
    def __init__(self, bus, index, service, setup):
        # Write-only on purpose: the password must not be readable afterwards.
        super().__init__(bus, index, WIFI_UUID, ["write"], service)
        self.setup = setup

    @dbus.service.method(Characteristic.IFACE, in_signature="aya{sv}")
    def WriteValue(self, value, options):
        self.setup.handle_wifi(bytes(bytearray(value)))


class SetupGattService(dbus.service.Object):
    IFACE = "org.bluez.GattService1"

    def __init__(self, bus, index, setup):
        self.path = f"{BASE_PATH}/service{index}"
        self.bus = bus
        super().__init__(bus, self.path)
        self.characteristics = [
            StatusCharacteristic(bus, 0, self, setup),
            NetworksCharacteristic(bus, 1, self, setup),
            ScanCharacteristic(bus, 2, self, setup),
            WifiCharacteristic(bus, 3, self, setup),
        ]

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def get_properties(self):
        return {self.IFACE: {
            "UUID": SERVICE_UUID,
            "Primary": dbus.Boolean(True),
            "Characteristics": dbus.Array(
                [c.get_path() for c in self.characteristics], signature="o"),
        }}

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != self.IFACE:
            raise InvalidArgsException()
        return self.get_properties()[self.IFACE]


class Application(dbus.service.Object):
    def __init__(self, bus, setup):
        self.path = BASE_PATH
        super().__init__(bus, self.path)
        self.service = SetupGattService(bus, 0, setup)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    @dbus.service.method(DBUS_OM_IFACE, out_signature="a{oa{sa{sv}}}")
    def GetManagedObjects(self):
        response = {self.service.get_path(): self.service.get_properties()}
        for characteristic in self.service.characteristics:
            response[characteristic.get_path()] = characteristic.get_properties()
        return response


class Advertisement(dbus.service.Object):
    IFACE = "org.bluez.LEAdvertisement1"

    def __init__(self, bus, index, local_name):
        self.path = f"{BASE_PATH}/advertisement{index}"
        self.local_name = local_name
        super().__init__(bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != self.IFACE:
            raise InvalidArgsException()
        # A BLE advertisement is 31 bytes total. Flags take 3, a 128-bit
        # service UUID takes 18, leaving 10 for the name — which is exactly
        # what a 8-character LocalName needs. There is no room for anything
        # else, and BlueZ answers an overlong packet with the unhelpful
        # "Failed to parse advertisement". Notably "Includes: local-name"
        # alongside LocalName both contradicts it and overflows.
        return {
            "Type": "peripheral",
            "ServiceUUIDs": dbus.Array([SERVICE_UUID], signature="s"),
            "LocalName": dbus.String(self.local_name[:8]),
        }

    @dbus.service.method(IFACE)
    def Release(self):
        logger.info("[ble] advertisement released")


# ── Bring-up ──────────────────────────────────────────────────────────────────

def _find_adapter(bus):
    manager = dbus.Interface(bus.get_object(BLUEZ, "/"), DBUS_OM_IFACE)
    for path, interfaces in manager.GetManagedObjects().items():
        if GATT_MANAGER_IFACE in interfaces and LE_ADVERTISING_MANAGER_IFACE in interfaces:
            return path
    return None


def run_peripheral(setup) -> None:
    """Register the GATT application and advertise. Blocks on the GLib loop."""
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()

    adapter_path = _find_adapter(bus)
    if adapter_path is None:
        logger.error("[ble] no Bluetooth adapter with GATT support — setup over "
                     "Bluetooth is unavailable")
        return

    adapter = dbus.Interface(bus.get_object(BLUEZ, adapter_path), DBUS_PROP_IFACE)
    try:
        adapter.Set(ADAPTER_IFACE, "Powered", dbus.Boolean(True))
    except dbus.exceptions.DBusException as exc:
        # BlueZ answers a soft-blocked radio with a bare "Failed", which says
        # nothing useful. Raspberry Pi OS ships Bluetooth blocked, so name the
        # likely cause and the one-line fix instead.
        logger.error("[ble] could not power on the Bluetooth adapter (%s). "
                     "If the radio is soft-blocked, run: sudo rfkill unblock bluetooth",
                     exc.get_dbus_message() or exc)
        return
    adapter.Set(ADAPTER_IFACE, "Alias", dbus.String(setup.adapter_name))

    application = Application(bus, setup)
    advertisement = Advertisement(bus, 0, setup.adapter_name)

    gatt_manager = dbus.Interface(bus.get_object(BLUEZ, adapter_path), GATT_MANAGER_IFACE)
    ad_manager = dbus.Interface(bus.get_object(BLUEZ, adapter_path),
                                LE_ADVERTISING_MANAGER_IFACE)
    loop = GLib.MainLoop()

    def registered(what):
        logger.info("[ble] %s registered", what)

    def failed(what, error):
        logger.error("[ble] %s registration failed: %s", what, error)
        loop.quit()

    gatt_manager.RegisterApplication(
        application.get_path(), {},
        reply_handler=lambda: registered("GATT application"),
        error_handler=lambda e: failed("GATT application", e))
    ad_manager.RegisterAdvertisement(
        advertisement.get_path(), {},
        reply_handler=lambda: registered("advertisement"),
        error_handler=lambda e: failed("advertisement", e))

    logger.info("[ble] advertising as %r — pair from the setup page to configure "
                "Wi-Fi or read the tunnel URL", setup.adapter_name)
    try:
        loop.run()
    except Exception:
        logger.exception("[ble] peripheral stopped")
    finally:
        try:
            ad_manager.UnregisterAdvertisement(advertisement.get_path())
        except Exception:
            pass
