"""Recognize preserved Circuit Check snapshots/reports, without guessing pin data."""
import json

def unwrap(value):
    if not isinstance(value,dict):raise ValueError('Expected a Circuit Check capture object.')
    run=value.get('run')
    capture=run.get('snapshot') if isinstance(run,dict) else None
    capture=capture or value.get('snapshot') or value
    if not isinstance(capture,dict) or capture.get('schema')!=1:raise ValueError('Expected a schema:1 Circuit Check captured snapshot or report.')
    components=capture.get('components')
    if not isinstance(components,list) or not 1<=len(components)<=500:raise ValueError('Captured input requires 1–500 components.')
    ids=set();pins=0
    for component in components:
        if not isinstance(component,dict) or not isinstance(component.get('id'),str) or not component['id'] or component['id'] in ids:raise ValueError('Captured component identifiers must be unique nonempty strings.')
        ids.add(component['id'])
        if not isinstance(component.get('terminals'),list):raise ValueError('Captured components require explicit terminal lists.')
        pins+=len(component['terminals'])
        if pins>5000:raise ValueError('Captured input exceeds 5,000 pins.')
    return capture

def read_capture(path):
    if path.stat().st_size>5*1024*1024:raise ValueError('Captured JSON exceeds 5 MB.')
    try:return unwrap(json.loads(path.read_text(encoding='utf-8-sig')))
    except (json.JSONDecodeError,UnicodeError,RecursionError) as error:raise ValueError('Captured circuit JSON is invalid.') from error
