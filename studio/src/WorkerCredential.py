"""Read the current Windows user's Worker Gateway DPAPI credential."""

import ctypes
import os
from ctypes import wintypes
from pathlib import Path

from .LocalMCPClient import LocalMCPError


class DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


class WorkerCredential:
    @classmethod
    def _unprotect(cls, encrypted: bytes) -> str:
        source = (ctypes.c_ubyte * len(encrypted)).from_buffer_copy(encrypted)
        inputBlob = DataBlob(len(encrypted), source)
        outputBlob = DataBlob()
        crypt = ctypes.WinDLL("crypt32", use_last_error=True)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        crypt.CryptUnprotectData.argtypes = [
            ctypes.POINTER(DataBlob), ctypes.c_void_p, ctypes.POINTER(DataBlob),
            ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DataBlob),
        ]
        crypt.CryptUnprotectData.restype = wintypes.BOOL
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p

        if not crypt.CryptUnprotectData(ctypes.byref(inputBlob), None, None, None, None, 1,
                                       ctypes.byref(outputBlob)):
            raise LocalMCPError("Worker Gateway credential could not be decrypted.")

        try:
            return ctypes.string_at(outputBlob.pbData, outputBlob.cbData).decode("utf-16-le")
        finally:
            ctypes.memset(outputBlob.pbData, 0, outputBlob.cbData)
            if kernel.LocalFree(ctypes.cast(outputBlob.pbData, ctypes.c_void_p)):
                raise LocalMCPError("Windows could not release the credential buffer.")

    @classmethod
    def read(cls) -> str:
        if os.name != "nt":
            raise LocalMCPError("Worker Gateway credentials require Windows.")

        path = Path(os.environ["LOCALAPPDATA"]) / "AIWorkerGateway" / "client-token.dpapi"

        if not path.is_file():
            raise LocalMCPError("Worker Gateway is not installed for this Windows user.")

        if path.stat().st_size > 16_384:
            raise LocalMCPError("Worker Gateway credential file exceeds the supported size.")

        # PowerShell ConvertFrom-SecureString stores the DPAPI blob as ASCII hex.
        encrypted = bytes.fromhex(path.read_text(encoding="ascii"))

        if not encrypted:
            raise LocalMCPError("Worker Gateway credential file is empty.")

        token = cls._unprotect(encrypted)

        if not token or len(token) > 4096 or any(char.isspace() for char in token):
            raise LocalMCPError("Worker Gateway credential is invalid.")

        return token
