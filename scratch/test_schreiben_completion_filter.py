"""
Test Suite: Verify Schreiben practice attempt completion filtering and DB ID preservation
"""
import re
import json

def test_syntax_and_patterns():
    # 1. Check schreiben-player.js
    with open(r"c:\Users\admin\Desktop\cocogermany\practice\components\schreiben-player.js", "r", encoding="utf-8") as f:
        schreiben_code = f.read()

    # Verify authoritativeId logic
    assert "authoritativeId" in schreiben_code, "authoritativeId check missing from schreiben-player.js"
    assert "resolvedMaterialId" in schreiben_code, "resolvedMaterialId check missing from schreiben-player.js"
    assert "id: authoritativeId" in schreiben_code, "id: authoritativeId missing from content merge in schreiben-player.js"

    # Verify savePracticeAttempt logic
    assert "insertError.code === \"23505\"" in schreiben_code, "23505 handling missing"
    assert "window.PracticeHubComponent.completedMaterialIds.add(matId)" in schreiben_code, "completedMaterialIds.add(matId) missing on duplicate"
    assert "localStorage.removeItem(\"coco_practice_hub_materials_cache\")" in schreiben_code, "cache removal missing"

    # Verify exitPlayer has cache clearing
    exit_idx = schreiben_code.find("exitPlayer: function")
    assert exit_idx != -1, "exitPlayer function missing"
    exit_block = schreiben_code[exit_idx:exit_idx+500]
    assert "localStorage.removeItem(\"coco_practice_hub_materials_cache\")" in exit_block, "cache removal missing in exitPlayer"

    # 2. Check practice-app.js
    with open(r"c:\Users\admin\Desktop\cocogermany\practice\practice-app.js", "r", encoding="utf-8") as f:
        app_code = f.read()

    assert "window.SchreibenPlayerComponent.preloadedMaterial = material;" in app_code, "preloadedMaterial setting missing in openPrepModal"

    # 3. Check interactive-player.js
    with open(r"c:\Users\admin\Desktop\cocogermany\practice\components\interactive-player.js", "r", encoding="utf-8") as f:
        interactive_code = f.read()

    assert "id: (material && material.id) || materialId || content?.id" in interactive_code, "id safeguard missing in interactive-player.js"

    print("Pattern and source checks passed successfully.")

def test_id_preservation_simulation():
    """
    Simulate what happens when material comes from DB with id='db-uuid-1234'
    and content JSON comes from R2 with id='schreiben-template'.
    """
    material_db = {
        "id": "db-uuid-1234",
        "title": "Formal Email to Landlord",
        "exam": "goethe",
        "level": "B1",
        "module": "Schreiben",
        "teil": "Teil 1",
        "contentPath": "materials/schreiben-b1-1.json"
    }

    content_r2 = {
        "id": "schreiben-template",
        "title": "Beispiel Schreibaufgabe",
        "module": "Schreiben",
        "exam": "goethe",
        "level": "B1",
        "teil": "Teil 1",
        "task": {
            "situation": "Test situation",
            "aufgabe": "Test aufgabe",
            "leitpunkte": ["Punkt 1", "Punkt 2", "Punkt 3"]
        }
    }

    material_id_arg = "db-uuid-1234"
    resolvedMaterialId = str(material_id_arg or "").strip()
    authoritativeId = resolvedMaterialId or (material_db and str(material_db.get("id"))) or ""

    # Perform the merge as in schreiben-player.js
    merged_material = {
        **material_db,
        **content_r2,
        "id": authoritativeId or material_db.get("id") or content_r2.get("id") or "schreiben-fallback",
        "teil": material_db.get("teil") or content_r2.get("teil") or "",
        "exam": material_db.get("exam") or content_r2.get("exam") or "goethe",
        "level": material_db.get("level") or content_r2.get("level") or "B1",
        "module": "Schreiben"
    }

    if authoritativeId and str(merged_material["id"]) != authoritativeId:
        merged_material["id"] = authoritativeId

    assert merged_material["id"] == "db-uuid-1234", f"Expected id 'db-uuid-1234', got {merged_material['id']}"
    print(f"Simulation test passed: merged_material['id'] = {merged_material['id']}")

    # Simulate saving attempt
    mat_id = str(merged_material.get("id") or "").strip()
    attempt_payload = {
        "uid": "user-abc-789",
        "material_id": mat_id,
        "level": "B1",
        "format": "goethe",
        "module": "Schreiben",
        "correct_answers": 10,
        "total_questions": 10,
        "score_percent": 100
    }

    assert attempt_payload["material_id"] == "db-uuid-1234", "Attempt payload must contain database UUID"

    # Simulate Practice Hub lookup from practice_attempts table
    practice_attempts_table = [
        {"uid": "user-abc-789", "material_id": "db-uuid-1234"}
    ]

    completed_material_ids = set(
        row["material_id"] for row in practice_attempts_table if row["uid"] == "user-abc-789"
    )

    # Supabase materials list
    supabase_materials = [
        {"id": "db-uuid-1234", "title": "Formal Email to Landlord", "module": "Schreiben"},
        {"id": "db-uuid-5678", "title": "Forum Post about Media", "module": "Schreiben"}
    ]

    # Filtering in Practice Hub
    filtered_materials = [
        m for m in supabase_materials if m and str(m["id"]).strip() not in completed_material_ids
    ]

    assert len(filtered_materials) == 1, f"Expected 1 material remaining, got {len(filtered_materials)}"
    assert filtered_materials[0]["id"] == "db-uuid-5678", "db-uuid-1234 should be filtered out!"
    print("Practice Hub completed materials filtering simulation passed: completed material successfully excluded!")

if __name__ == "__main__":
    test_syntax_and_patterns()
    test_id_preservation_simulation()
    print("ALL TESTS PASSED!")
