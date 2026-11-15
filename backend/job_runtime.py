"""Cooperative cancellation shared by analysis stages and native subprocess waits."""
from contextvars import ContextVar
from contextlib import contextmanager

class AnalysisCancelled(RuntimeError):
    pass

_check = ContextVar('analysis_cancellation', default=lambda: None)

def checkpoint():
    _check.get()()

@contextmanager
def cancellation(check):
    token = _check.set(check)
    try:
        yield
    finally:
        _check.reset(token)
