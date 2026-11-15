"""Provider secrets in the current user's OS credential store, never a JSON file."""
import os

def _windows():
    import ctypes as c
    from ctypes import wintypes as w
    class Credential(c.Structure):
        _fields_=[('Flags',w.DWORD),('Type',w.DWORD),('TargetName',w.LPWSTR),('Comment',w.LPWSTR),('LastWritten',w.FILETIME),('CredentialBlobSize',w.DWORD),('CredentialBlob',c.POINTER(c.c_ubyte)),('Persist',w.DWORD),('AttributeCount',w.DWORD),('Attributes',c.c_void_p),('TargetAlias',w.LPWSTR),('UserName',w.LPWSTR)]
    api=c.WinDLL('Advapi32.dll',use_last_error=True)
    api.CredWriteW.argtypes=[c.POINTER(Credential),w.DWORD];api.CredWriteW.restype=w.BOOL
    api.CredReadW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD,c.POINTER(c.POINTER(Credential))];api.CredReadW.restype=w.BOOL
    api.CredDeleteW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD];api.CredDeleteW.restype=w.BOOL
    api.CredFree.argtypes=[c.c_void_p]
    return c,Credential,api

def _keyring():
    try:
        import keyring
        # Reject backends that persist secrets as an unencrypted file.
        name=type(keyring.get_keyring()).__module__
        if not any(part in name for part in ('Windows','macOS','SecretService','libsecret')):raise ImportError
        return keyring
    except ImportError:raise ValueError('An OS credential store is unavailable. On Linux/macOS install keyring with a system credential backend, or supply GROQ_API_KEY in the process environment. No key was saved.') from None

def load_secret(target):
    if os.name!='nt':
        try:return _keyring().get_password('CircuitCheck',target)
        except ValueError:return None
    c,Credential,api=_windows();pointer=c.POINTER(Credential)()
    if not api.CredReadW(target,1,0,c.byref(pointer)):
        if c.get_last_error()==1168:return None
        raise OSError('Windows Credential Manager could not read the provider credential.')
    try:return c.string_at(pointer.contents.CredentialBlob,pointer.contents.CredentialBlobSize).decode('utf-8')
    finally:api.CredFree(pointer)

def save_secret(target,value):
    if os.name!='nt':_keyring().set_password('CircuitCheck',target,value);return
    c,Credential,api=_windows();blob=(c.c_ubyte*len(value.encode())).from_buffer_copy(value.encode())
    record=Credential(Type=1,TargetName=target,Comment='CircuitCheck provider credential',CredentialBlobSize=len(blob),CredentialBlob=blob,Persist=2,UserName='CircuitCheck')
    if not api.CredWriteW(c.byref(record),0):raise OSError('Windows Credential Manager could not save the provider credential. No plaintext fallback was used.')

def delete_secret(target):
    if os.name!='nt':
        ring=_keyring()
        if ring.get_password('CircuitCheck',target):ring.delete_password('CircuitCheck',target)
        return
    c,_,api=_windows()
    if not api.CredDeleteW(target,1,0) and c.get_last_error()!=1168:raise OSError('Windows Credential Manager could not remove the provider credential.')
