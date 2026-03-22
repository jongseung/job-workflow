#!/usr/bin/env python3
"""Integration test for Job Scheduler API."""
import requests
import json
import time
import sys

BASE = "http://localhost:8000/api"

def main():
    print("=" * 60)
    print("Job Scheduler Integration Test")
    print("=" * 60)

    # 1. Login
    print("\n[1] Auth - Login")
    r = requests.post(f"{BASE}/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print(f"    ✅ Login OK, token: {token[:20]}...")

    # 2. Get Me
    print("\n[2] Auth - Get Me")
    r = requests.get(f"{BASE}/auth/me", headers=headers)
    assert r.status_code == 200
    me = r.json()
    print(f"    ✅ User: {me['username']}, Role: {me['role']}")

    # 3. Create Job
    print("\n[3] Jobs - Create")
    code = '''import time
print("Hello from integration test!")
for i in range(3):
    print(f"Processing step {i+1}/3")
    time.sleep(0.3)
print("All steps completed successfully!")
'''
    r = requests.post(f"{BASE}/jobs", json={
        "name": "Integration Test Job",
        "description": "Automated integration test job",
        "code": code,
        "schedule_type": "manual",
        "max_retries": 0,
        "timeout_seconds": 60,
    }, headers=headers)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    job = r.json()
    job_id = job["id"]
    print(f"    ✅ Created: {job['name']} (ID: {job_id[:8]})")

    # 4. Get Job
    print("\n[4] Jobs - Get Detail")
    r = requests.get(f"{BASE}/jobs/{job_id}", headers=headers)
    assert r.status_code == 200
    print(f"    ✅ Name: {r.json()['name']}, Schedule: {r.json()['schedule_type']}")

    # 5. List Jobs
    print("\n[5] Jobs - List")
    r = requests.get(f"{BASE}/jobs", headers=headers)
    assert r.status_code == 200
    data = r.json()
    print(f"    ✅ Total jobs: {data['total']}")

    # 6. Trigger Run
    print("\n[6] Jobs - Trigger Run")
    r = requests.post(f"{BASE}/jobs/{job_id}/run", headers=headers)
    assert r.status_code == 200
    run = r.json()
    run_id = run["run_id"]
    print(f"    ✅ Run started: {run_id[:8]}, Status: {run['status']}")

    # 7. Wait for completion
    print("\n[7] Runs - Wait for completion")
    final_status = "pending"
    for i in range(30):
        time.sleep(1)
        r = requests.get(f"{BASE}/runs/recent?limit=10", headers=headers)
        if r.status_code == 200:
            runs = r.json()
            current = [x for x in runs if x["id"] == run_id]
            if current:
                final_status = current[0]["status"]
                if final_status in ("success", "failed", "cancelled"):
                    print(f"    ✅ Completed with status: {final_status}")
                    break
        if i % 3 == 0:
            print(f"    ⏳ Waiting... ({i}s, status: {final_status})")
    else:
        print(f"    ⚠️ Timeout waiting for run (last status: {final_status})")

    # 8. Get Logs
    print("\n[8] Logs - Get Run Logs")
    r = requests.get(f"{BASE}/logs/{run_id}", headers=headers)
    assert r.status_code == 200
    logs = r.json()
    print(f"    ✅ Total log lines: {logs['total']}")
    for log in logs.get("items", [])[:5]:
        print(f"       [{log['stream']}] {log['message']}")

    # 9. Code Analysis
    print("\n[9] Analysis - Analyze Code")
    r = requests.post(f"{BASE}/analysis/analyze", json={"code": code}, headers=headers)
    assert r.status_code == 200
    analysis = r.json()
    print(f"    ✅ Valid: {analysis['is_valid']}, Lines: {analysis['total_lines']}, Imports: {len(analysis['imports'])}")
    for imp in analysis["imports"]:
        print(f"       📦 {imp['module']} (stdlib: {imp['is_stdlib']})")

    # 10. System Stats
    print("\n[10] System - Stats")
    r = requests.get(f"{BASE}/system/stats", headers=headers)
    assert r.status_code == 200
    stats = r.json()
    print(f"    ✅ Jobs: {stats['total_jobs']}, Runs: {stats['total_runs']}, Success Rate: {stats['success_rate']}%")
    print(f"       Scheduler: {'Running' if stats['scheduler_running'] else 'Stopped'}")

    # 11. Run History
    print("\n[11] System - Run History")
    r = requests.get(f"{BASE}/system/run-history?days=7", headers=headers)
    assert r.status_code == 200
    history = r.json()
    print(f"    ✅ Data points: {len(history)} days")

    # 12. Audit Trail
    print("\n[12] Audit - Logs")
    r = requests.get(f"{BASE}/audit", headers=headers)
    assert r.status_code == 200
    audit = r.json()
    print(f"    ✅ Total entries: {audit['total']}")
    for entry in audit["items"][:5]:
        details_str = json.dumps(entry.get("details", {})) if entry.get("details") else "-"
        print(f"       [{entry['action']}] {entry['resource_type']} : {details_str}")

    # 13. Scheduler Status
    print("\n[13] Scheduler - Status")
    r = requests.get(f"{BASE}/scheduler/status", headers=headers)
    assert r.status_code == 200
    sched = r.json()
    print(f"    ✅ Running: {sched['running']}, Scheduled Jobs: {sched['job_count']}")

    # 14. Health Check
    print("\n[14] System - Health")
    r = requests.get(f"{BASE}/system/health")
    assert r.status_code == 200
    print(f"    ✅ Status: {r.json()['status']}")

    # 15. Toggle Job
    print("\n[15] Jobs - Toggle Active")
    r = requests.put(f"{BASE}/jobs/{job_id}/toggle", headers=headers)
    assert r.status_code == 200
    print(f"    ✅ Active: {r.json()['is_active']}")

    # 16. Update Job
    print("\n[16] Jobs - Update")
    r = requests.put(f"{BASE}/jobs/{job_id}", json={
        "name": "Updated Test Job",
        "description": "Updated description",
        "code": code,
        "schedule_type": "manual",
        "max_retries": 2,
        "timeout_seconds": 120,
    }, headers=headers)
    assert r.status_code == 200
    print(f"    ✅ Updated name: {r.json()['name']}, retries: {r.json()['max_retries']}")

    # Cleanup
    print("\n[17] Jobs - Delete")
    r = requests.delete(f"{BASE}/jobs/{job_id}", headers=headers)
    assert r.status_code == 200
    print(f"    ✅ Deleted: {r.json()['message']}")

    print("\n" + "=" * 60)
    print("✅ ALL 17 INTEGRATION TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    main()
