"""Verifica os exemplos com o subconjunto de JSON Schema usado neste esboço.

Não substitui um validador completo Draft 2020-12 na implementação do app.
"""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent.parent
schema = json.loads((root / "contracts/flow.schema.json").read_text(encoding="utf-8"))


def validate(value, rule, path=""):
    if "$ref" in rule:
        rule = schema["$defs"][rule["$ref"].split("/")[-1]]
    if "const" in rule:
        assert type(value) is int and value == rule["const"], path
    if "enum" in rule:
        assert value in rule["enum"], path
    kind = rule.get("type")
    if kind == "object":
        assert isinstance(value, dict), path
        assert all(key in value for key in rule.get("required", [])), path
        properties = rule.get("properties", {})
        for key, item in value.items():
            if "propertyNames" in rule:
                validate(key, rule["propertyNames"], path)
            if key in properties:
                validate(item, properties[key], path + "/" + key)
            elif rule.get("additionalProperties") is False:
                raise AssertionError(path + "/" + key)
            elif isinstance(rule.get("additionalProperties"), dict):
                validate(item, rule["additionalProperties"], path + "/" + key)
    elif kind == "array":
        assert isinstance(value, list), path
        for index, item in enumerate(value):
            validate(item, rule["items"], path + "/" + str(index))
    elif kind == "string":
        assert isinstance(value, str), path
        assert len(value) >= rule.get("minLength", 0), path
    elif kind == "number":
        assert type(value) in (int, float) and math.isfinite(value), path
        if "exclusiveMinimum" in rule:
            assert value > rule["exclusiveMinimum"], path

for path in sorted((root / "examples").glob("*.flow.json")):
    document = json.loads(path.read_text(encoding="utf-8"))
    validate(document, schema)
    nodes = {node["id"] for node in document["content"]["nodes"]}
    edges = {edge["id"] for edge in document["content"]["edges"]}
    ids = [item["id"] for collection in document["content"].values() for item in collection]
    assert len(ids) == len(set(ids)), "IDs duplicados"
    for edge in document["content"]["edges"]:
        assert edge["source"] in nodes and edge["target"] in nodes, "Ponta inexistente"
    start = document["document"].get("startNodeId")
    assert start is None or start in nodes, "Inicio inexistente"
    layout = document.get("layout", {})
    assert set(layout.get("nodes", {})) <= nodes, "Layout de bloco inexistente"
    assert set(layout.get("edges", {})) <= edges, "Layout de ligacao inexistente"
    print(f"{path.name}: esquema, IDs, referencias e layout OK")
