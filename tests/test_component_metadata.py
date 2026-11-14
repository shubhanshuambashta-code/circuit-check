from backend.geometry import board_index


def test_component_metadata_retains_supplied_values_without_inventing_specs():
    text = '''(kicad_pcb
      (footprint "Resistor_SMD:R_0603_1608Metric" (uuid "r1") (layer "F.Cu") (at 10 20)
        (property "Reference" "R1") (property "Value" "10k")
        (property "Manufacturer" "Example maker") (property "MPN" "EX-10K")
        (model "${KIPRJMOD}/models/resistor.step" (offset (xyz 0 0 0)))
        (pad "1" smd rect (uuid "p1") (at 0 0) (size 1 1) (layers "F.Cu")))
      (footprint "Connector" (uuid "j1") (layer "B.Cu") (at 5 5)
        (property "Reference" "J1")
        (pad "1" smd rect (uuid "p2") (at 0 0) (size 1 1) (layers "B.Cu"))))'''
    parts = {o['reference']: o for o in board_index(text)['objects'] if o['kind'] == 'component'}
    assert parts['R1']['value'] == '10k'
    assert parts['R1']['footprint'] == 'Resistor_SMD:R_0603_1608Metric'
    assert parts['R1']['part_number'] == 'EX-10K'
    assert parts['R1']['manufacturer'] == 'Example maker'
    assert parts['R1']['models'] == [{'path': '${KIPRJMOD}/models/resistor.step', 'hidden': False}]
    assert parts['J1']['models'] == []
    assert parts['J1']['part_number'] is None
    assert parts['J1']['value'] is None
