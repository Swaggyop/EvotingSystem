#!/bin/bash
set -e
cd /home/claude/evoting/backend
pkill -f "python3 app.py" 2>/dev/null || true
sleep 1

python3 app.py > server.log 2>&1 &
SERVER_PID=$!
sleep 2

echo "=== HEALTH CHECK ==="
curl -s http://localhost:5000/api/health; echo

echo ""
echo "=== 1. REGISTER 3 VOTERS ==="
R1=$(curl -s -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d '{"voter_id":"VID0001","email":"v1@test.com"}')
echo "$R1"
H1=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin)['voter_id_hash'])")
S1=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin)['totp_secret'])")

R2=$(curl -s -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d '{"voter_id":"VID0002","email":"v2@test.com"}')
H2=$(echo "$R2" | python3 -c "import sys,json; print(json.load(sys.stdin)['voter_id_hash'])")

R3=$(curl -s -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d '{"voter_id":"VID0003","email":"v3@test.com"}')
H3=$(echo "$R3" | python3 -c "import sys,json; print(json.load(sys.stdin)['voter_id_hash'])")

echo ""
echo "=== 2. DUPLICATE REGISTRATION REJECTED ==="
curl -s -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d '{"voter_id":"VID0001","email":"v1@test.com"}' -w "\nHTTP:%{http_code}\n"

echo ""
echo "=== 3. LOGIN VOTER 1 (TOTP + OTP) ==="
OTP1=$(curl -s -X POST http://localhost:5000/api/otp/send -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H1\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['demo_code'])")
TOTP1=$(python3 -c "import pyotp; print(pyotp.TOTP('$S1').now())")
curl -s -X POST http://localhost:5000/api/login -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H1\",\"totp_code\":\"$TOTP1\",\"otp_code\":\"$OTP1\"}"

echo ""
echo ""
echo "=== 4. REQUEST BLIND-SIGNED BALLOTS (3 voters) ==="
BALLOT1=$(curl -s -X POST http://localhost:5000/api/ballot/request -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H1\"}")
echo "$BALLOT1"
BID1=$(echo "$BALLOT1" | python3 -c "import sys,json; print(json.load(sys.stdin)['ballot_id'])")

BALLOT2=$(curl -s -X POST http://localhost:5000/api/ballot/request -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H2\"}")
BID2=$(echo "$BALLOT2" | python3 -c "import sys,json; print(json.load(sys.stdin)['ballot_id'])")

BALLOT3=$(curl -s -X POST http://localhost:5000/api/ballot/request -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H3\"}")
BID3=$(echo "$BALLOT3" | python3 -c "import sys,json; print(json.load(sys.stdin)['ballot_id'])")

echo ""
echo "=== 5. CAST 3 VOTES (v1->c1, v2->c1, v3->c2) ==="
VOTE1=$(curl -s -X POST http://localhost:5000/api/vote/submit -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H1\",\"ballot_id\":\"$BID1\",\"candidate_id\":\"c1\"}")
echo "$VOTE1"
RECEIPT1=$(echo "$VOTE1" | python3 -c "import sys,json; print(json.load(sys.stdin)['receipt_hash'])")

curl -s -X POST http://localhost:5000/api/vote/submit -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H2\",\"ballot_id\":\"$BID2\",\"candidate_id\":\"c1\"}"
echo ""
curl -s -X POST http://localhost:5000/api/vote/submit -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H3\",\"ballot_id\":\"$BID3\",\"candidate_id\":\"c2\"}"

echo ""
echo ""
echo "=== 6. DUPLICATE VOTE REJECTED ==="
curl -s -X POST http://localhost:5000/api/vote/submit -H "Content-Type: application/json" -d "{\"voter_id_hash\":\"$H1\",\"ballot_id\":\"$BID1\",\"candidate_id\":\"c2\"}" -w "\nHTTP:%{http_code}\n"

echo ""
echo "=== 7. VERIFY RECEIPT INCLUSION ==="
curl -s http://localhost:5000/api/vote/verify-receipt/$RECEIPT1

echo ""
echo ""
echo "=== 8. CLOSE ELECTION + SUBMIT 2 CUSTODIAN SHARES ==="
curl -s -X POST http://localhost:5000/api/admin/election/close
echo ""
curl -s -X POST http://localhost:5000/api/admin/custodians/kc1/submit
echo ""
curl -s -X POST http://localhost:5000/api/admin/custodians/kc2/submit

echo ""
echo ""
echo "=== 9. PUBLIC RESULTS ==="
curl -s http://localhost:5000/api/results

echo ""
echo ""
echo "=== 10. PDF REPORT ==="
curl -s http://localhost:5000/api/admin/report -o /tmp/report_test.pdf -w "HTTP:%{http_code} SIZE:%{size_download} bytes\n"
file /tmp/report_test.pdf

kill $SERVER_PID 2>/dev/null || true
echo ""
echo "=== SERVER LOG ERRORS ==="
grep -i "error\|traceback\|exception" server.log || echo "No errors."
