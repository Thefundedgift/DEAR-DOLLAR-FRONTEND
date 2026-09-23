#!/usr/bin/env python3
"""
DEAR DOLLAR Backend API Test Suite
Tests all backend endpoints including mock-admin auto-approval flows
"""

import requests
import time
import random
import json
from datetime import datetime

# Base URL from .env
BASE_URL = "https://wallet-marketplace-3.preview.emergentagent.com/api"

# Test state
test_state = {
    "mobile": None,
    "password": "Test@123",
    "access_token": None,
    "refresh_token": None,
    "user_id": None,
    "deposit_id": None,
    "listing_id_buy": None,
    "listing_id_sell": None,
    "order_id_buy": None,
    "order_id_sell": None,
}

def log(message):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def generate_mobile():
    """Generate random valid Indian mobile number"""
    first_digit = random.choice(['6', '7', '8', '9'])
    rest = ''.join([str(random.randint(0, 9)) for _ in range(9)])
    return first_digit + rest

def test_api_root():
    """Test 25: API root endpoint"""
    log("TEST: API root endpoint")
    try:
        resp = requests.get(f"{BASE_URL}/")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "DEAR DOLLAR" in data.get("message", ""), "API message not found"
        log("✅ API root endpoint working")
        return True
    except Exception as e:
        log(f"❌ API root failed: {e}")
        return False

def test_community_links():
    """Test 23: GET /api/community-links (no auth)"""
    log("TEST: Community links (public)")
    try:
        resp = requests.get(f"{BASE_URL}/community-links")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "links" in data, "Links not found in response"
        links = data["links"]
        assert len(links) >= 2, f"Expected at least 2 links, got {len(links)}"
        platforms = [l["platform"] for l in links]
        assert "telegram" in platforms, "Telegram link not found"
        assert "discord" in platforms, "Discord link not found"
        log(f"✅ Community links working: {platforms}")
        return True
    except Exception as e:
        log(f"❌ Community links failed: {e}")
        return False

def test_register():
    """Test 1: POST /api/auth/register with valid data"""
    log("TEST: User registration")
    mobile = generate_mobile()
    test_state["mobile"] = mobile
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": mobile,
            "password": test_state["password"],
            "confirmPassword": test_state["password"]
        })
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "user" in data, "User not in response"
        assert "accessToken" in data, "Access token not in response"
        assert "refreshToken" in data, "Refresh token not in response"
        assert "passwordHash" not in data.get("user", {}), "Password hash exposed in response!"
        
        test_state["access_token"] = data["accessToken"]
        test_state["refresh_token"] = data["refreshToken"]
        test_state["user_id"] = data["user"]["id"]
        
        log(f"✅ Registration successful for mobile: {mobile}")
        return True
    except Exception as e:
        log(f"❌ Registration failed: {e}")
        return False

def test_register_validations():
    """Test 2: Registration validation errors"""
    log("TEST: Registration validations")
    errors = []
    
    # Invalid mobile
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": "12345",
            "password": "Test@123",
            "confirmPassword": "Test@123"
        })
        assert resp.status_code == 400, f"Expected 400 for invalid mobile, got {resp.status_code}"
        msg = resp.json().get("message", "")
        assert "mobile" in msg.lower() or "valid" in msg.lower(), f"Error message not clear: {msg}"
        log("✅ Invalid mobile validation working")
    except Exception as e:
        errors.append(f"Invalid mobile: {e}")
    
    # Weak password
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": generate_mobile(),
            "password": "abc",
            "confirmPassword": "abc"
        })
        assert resp.status_code == 400, f"Expected 400 for weak password, got {resp.status_code}"
        assert "password" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Weak password validation working")
    except Exception as e:
        errors.append(f"Weak password: {e}")
    
    # Mismatched passwords
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": generate_mobile(),
            "password": "Test@123",
            "confirmPassword": "Different@123"
        })
        assert resp.status_code == 400, f"Expected 400 for mismatched passwords, got {resp.status_code}"
        assert "match" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Password mismatch validation working")
    except Exception as e:
        errors.append(f"Password mismatch: {e}")
    
    # Duplicate mobile
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "mobile": test_state["mobile"],
            "password": "Test@123",
            "confirmPassword": "Test@123"
        })
        assert resp.status_code == 409, f"Expected 409 for duplicate mobile, got {resp.status_code}"
        assert "exists" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Duplicate mobile validation working")
    except Exception as e:
        errors.append(f"Duplicate mobile: {e}")
    
    if errors:
        log(f"❌ Registration validations failed: {errors}")
        return False
    return True

def test_login():
    """Test 3: POST /api/auth/login with correct and wrong password"""
    log("TEST: User login")
    
    # Correct password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_state["mobile"],
            "password": test_state["password"]
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "accessToken" in data, "Access token not in response"
        log("✅ Login with correct password working")
    except Exception as e:
        log(f"❌ Login with correct password failed: {e}")
        return False
    
    # Wrong password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "mobile": test_state["mobile"],
            "password": "WrongPassword123"
        })
        assert resp.status_code == 401, f"Expected 401 for wrong password, got {resp.status_code}"
        log("✅ Login with wrong password returns 401")
    except Exception as e:
        log(f"❌ Login with wrong password test failed: {e}")
        return False
    
    return True

def test_refresh_token():
    """Test 4: POST /api/auth/refresh with token rotation"""
    log("TEST: Refresh token with rotation")
    old_refresh = test_state["refresh_token"]
    
    try:
        # Get new tokens
        resp = requests.post(f"{BASE_URL}/auth/refresh", json={
            "refreshToken": old_refresh
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "accessToken" in data, "Access token not in response"
        assert "refreshToken" in data, "Refresh token not in response"
        
        new_access = data["accessToken"]
        new_refresh = data["refreshToken"]
        assert new_access != test_state["access_token"], "Access token not rotated"
        assert new_refresh != old_refresh, "Refresh token not rotated"
        
        test_state["access_token"] = new_access
        test_state["refresh_token"] = new_refresh
        
        log("✅ Token refresh and rotation working")
        
        # Try using old refresh token (should fail)
        resp2 = requests.post(f"{BASE_URL}/auth/refresh", json={
            "refreshToken": old_refresh
        })
        assert resp2.status_code == 401, f"Expected 401 for old refresh token, got {resp2.status_code}"
        log("✅ Old refresh token invalidated correctly")
        
        return True
    except Exception as e:
        log(f"❌ Refresh token test failed: {e}")
        return False

def test_auth_me():
    """Test 5: GET /api/auth/me with and without token"""
    log("TEST: GET /api/auth/me")
    
    # With token
    try:
        headers = {"Authorization": f"Bearer {test_state['access_token']}"}
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "user" in data, "User not in response"
        assert data["user"]["mobile"] == test_state["mobile"], "Mobile mismatch"
        log("✅ GET /api/auth/me with token working")
    except Exception as e:
        log(f"❌ GET /api/auth/me with token failed: {e}")
        return False
    
    # Without token
    try:
        resp = requests.get(f"{BASE_URL}/auth/me")
        assert resp.status_code == 401, f"Expected 401 without token, got {resp.status_code}"
        log("✅ GET /api/auth/me without token returns 401")
    except Exception as e:
        log(f"❌ GET /api/auth/me without token test failed: {e}")
        return False
    
    return True

def test_forgot_password():
    """Test 7: POST /api/auth/forgot-password"""
    log("TEST: Forgot password")
    try:
        resp = requests.post(f"{BASE_URL}/auth/forgot-password", json={
            "mobile": test_state["mobile"]
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "message" in data, "Message not in response"
        log("✅ Forgot password returns generic success message")
        return True
    except Exception as e:
        log(f"❌ Forgot password failed: {e}")
        return False

def test_wallet_initial():
    """Test 8: GET /api/wallet for new user (should be 0)"""
    log("TEST: Initial wallet balance")
    try:
        headers = {"Authorization": f"Bearer {test_state['access_token']}"}
        resp = requests.get(f"{BASE_URL}/wallet", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "money" in data, "Money wallet not in response"
        assert "dollar" in data, "Dollar wallet not in response"
        assert data["money"]["available"] == 0, f"Expected 0 money, got {data['money']['available']}"
        assert data["money"]["pending"] == 0, f"Expected 0 pending money, got {data['money']['pending']}"
        assert data["dollar"]["balance"] == 0, f"Expected 0 dollars, got {data['dollar']['balance']}"
        assert data["dollar"]["pending"] == 0, f"Expected 0 pending dollars, got {data['dollar']['pending']}"
        log("✅ Initial wallet balance is 0 for all fields")
        return True
    except Exception as e:
        log(f"❌ Initial wallet test failed: {e}")
        return False

def test_create_deposit():
    """Test 9: POST /api/deposits with valid amount"""
    log("TEST: Create deposit")
    try:
        headers = {"Authorization": f"Bearer {test_state['access_token']}"}
        resp = requests.post(f"{BASE_URL}/deposits", headers=headers, json={
            "amount": 500
        })
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "deposit" in data, "Deposit not in response"
        assert "upiString" in data, "UPI string not in response"
        
        deposit = data["deposit"]
        assert deposit["status"] == "AWAITING_PAYMENT", f"Expected AWAITING_PAYMENT, got {deposit['status']}"
        assert "upiId" in deposit, "UPI ID not in deposit"
        assert "payeeName" in deposit, "Payee name not in deposit"
        assert "upi://pay?pa=" in data["upiString"], "Invalid UPI string format"
        
        test_state["deposit_id"] = deposit["id"]
        log(f"✅ Deposit created: {deposit['id']}, UPI: {deposit['upiId']}")
        return True
    except Exception as e:
        log(f"❌ Create deposit failed: {e}")
        return False

def test_deposit_validations():
    """Test 10: Deposit amount validations"""
    log("TEST: Deposit validations")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    errors = []
    
    # Amount too low
    try:
        resp = requests.post(f"{BASE_URL}/deposits", headers=headers, json={"amount": 5})
        assert resp.status_code == 400, f"Expected 400 for low amount, got {resp.status_code}"
        assert "minimum" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Minimum deposit validation working")
    except Exception as e:
        errors.append(f"Min amount: {e}")
    
    # Amount too high
    try:
        resp = requests.post(f"{BASE_URL}/deposits", headers=headers, json={"amount": 200000})
        assert resp.status_code == 400, f"Expected 400 for high amount, got {resp.status_code}"
        assert "maximum" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Maximum deposit validation working")
    except Exception as e:
        errors.append(f"Max amount: {e}")
    
    if errors:
        log(f"❌ Deposit validations failed: {errors}")
        return False
    return True

def test_submit_utr():
    """Test 11: POST /api/deposits/{id}/utr with valid and invalid UTR"""
    log("TEST: Submit UTR")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    # Invalid UTR (too short)
    try:
        resp = requests.post(f"{BASE_URL}/deposits/{test_state['deposit_id']}/utr", 
                           headers=headers, json={"utr": "abc"})
        assert resp.status_code == 400, f"Expected 400 for invalid UTR, got {resp.status_code}"
        log("✅ Invalid UTR validation working")
    except Exception as e:
        log(f"❌ Invalid UTR test failed: {e}")
        return False
    
    # Valid UTR
    try:
        resp = requests.post(f"{BASE_URL}/deposits/{test_state['deposit_id']}/utr", 
                           headers=headers, json={"utr": "123456789012"})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["deposit"]["status"] == "PENDING", f"Expected PENDING, got {data['deposit']['status']}"
        log("✅ UTR submitted, status changed to PENDING")
        
        # Check wallet pending increased
        resp2 = requests.get(f"{BASE_URL}/wallet", headers=headers)
        wallet = resp2.json()
        assert wallet["money"]["pending"] == 500, f"Expected 500 pending, got {wallet['money']['pending']}"
        log("✅ Wallet moneyPending increased to 500")
    except Exception as e:
        log(f"❌ Submit UTR failed: {e}")
        return False
    
    # Re-submit UTR (should fail)
    try:
        resp = requests.post(f"{BASE_URL}/deposits/{test_state['deposit_id']}/utr", 
                           headers=headers, json={"utr": "999999999999"})
        assert resp.status_code == 400, f"Expected 400 for re-submit, got {resp.status_code}"
        log("✅ Re-submitting UTR correctly rejected")
    except Exception as e:
        log(f"❌ Re-submit UTR test failed: {e}")
        return False
    
    return True

def test_mock_admin_approval():
    """Test 12: Wait for mock-admin auto-approval (~50s)"""
    log("TEST: Mock-admin auto-approval (waiting 50 seconds...)")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        log("⏳ Waiting 50 seconds for mock-admin to process...")
        time.sleep(50)
        
        # Check wallet
        resp = requests.get(f"{BASE_URL}/wallet", headers=headers)
        assert resp.status_code == 200, f"Wallet check failed: {resp.status_code}"
        wallet = resp.json()
        assert wallet["money"]["available"] == 500, f"Expected 500 available, got {wallet['money']['available']}"
        assert wallet["money"]["pending"] == 0, f"Expected 0 pending, got {wallet['money']['pending']}"
        log("✅ Wallet updated: money.available = 500, pending = 0")
        
        # Check deposit status
        resp2 = requests.get(f"{BASE_URL}/deposits", headers=headers)
        deposits = resp2.json()["deposits"]
        deposit = next((d for d in deposits if d["id"] == test_state["deposit_id"]), None)
        assert deposit is not None, "Deposit not found"
        assert deposit["status"] == "APPROVED", f"Expected APPROVED, got {deposit['status']}"
        log("✅ Deposit status changed to APPROVED")
        
        # Check notifications
        resp3 = requests.get(f"{BASE_URL}/notifications", headers=headers)
        notifs = resp3.json()["notifications"]
        deposit_notif = next((n for n in notifs if n["type"] == "DEPOSIT_VERIFIED"), None)
        assert deposit_notif is not None, "DEPOSIT_VERIFIED notification not found"
        log("✅ DEPOSIT_VERIFIED notification created")
        
        # Check transactions
        resp4 = requests.get(f"{BASE_URL}/transactions", headers=headers)
        txns = resp4.json()["transactions"]
        deposit_txn = next((t for t in txns if t["type"] == "UPI_DEPOSIT"), None)
        assert deposit_txn is not None, "UPI_DEPOSIT transaction not found"
        assert deposit_txn["status"] == "COMPLETED", f"Expected COMPLETED, got {deposit_txn['status']}"
        log("✅ UPI_DEPOSIT transaction marked COMPLETED")
        
        return True
    except Exception as e:
        log(f"❌ Mock-admin approval test failed: {e}")
        return False

def test_listings():
    """Test 13: GET /api/listings?type=BUY and SELL"""
    log("TEST: Get listings")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        # BUY listings
        resp = requests.get(f"{BASE_URL}/listings?type=BUY", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "listings" in data, "Listings not in response"
        buy_listings = data["listings"]
        assert len(buy_listings) > 0, "No BUY listings found"
        test_state["listing_id_buy"] = buy_listings[0]["id"]
        log(f"✅ Found {len(buy_listings)} BUY listings (e.g., ₹{buy_listings[0]['priceInr']}=${buy_listings[0]['dollars']})")
        
        # SELL listings
        resp2 = requests.get(f"{BASE_URL}/listings?type=SELL", headers=headers)
        assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}: {resp2.text}"
        data2 = resp2.json()
        sell_listings = data2["listings"]
        assert len(sell_listings) > 0, "No SELL listings found"
        test_state["listing_id_sell"] = sell_listings[0]["id"]
        log(f"✅ Found {len(sell_listings)} SELL listings (e.g., ₹{sell_listings[0]['priceInr']}=${sell_listings[0]['dollars']})")
        
        return True
    except Exception as e:
        log(f"❌ Get listings failed: {e}")
        return False

def test_order_quote_buy():
    """Test 14: POST /api/orders/quote for BUY"""
    log("TEST: Order quote for BUY")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/orders/quote", headers=headers, json={
            "type": "BUY",
            "listingId": test_state["listing_id_buy"],
            "dollars": 9
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "quote" in data, "Quote not in response"
        quote = data["quote"]
        assert "rate" in quote, "Rate not in quote"
        assert "amountInr" in quote, "Amount INR not in quote"
        assert "currentMoney" in quote, "Current money not in quote"
        assert "moneyAfter" in quote, "Money after not in quote"
        assert "dollarsAfter" in quote, "Dollars after not in quote"
        assert "sufficient" in quote, "Sufficient flag not in quote"
        assert quote["sufficient"] == True, "Should have sufficient funds"
        assert quote["currentMoney"] == 500, f"Expected 500 current money, got {quote['currentMoney']}"
        log(f"✅ BUY quote: $9 @ ₹{quote['rate']}/$ = ₹{quote['amountInr']}, sufficient: {quote['sufficient']}")
        return True
    except Exception as e:
        log(f"❌ Order quote BUY failed: {e}")
        return False

def test_create_buy_order():
    """Test 15: POST /api/orders for BUY"""
    log("TEST: Create BUY order")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/orders", headers=headers, json={
            "type": "BUY",
            "listingId": test_state["listing_id_buy"],
            "dollars": 9
        })
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "order" in data, "Order not in response"
        order = data["order"]
        assert order["status"] == "PENDING", f"Expected PENDING, got {order['status']}"
        test_state["order_id_buy"] = order["id"]
        log(f"✅ BUY order created: {order['id']}, status: PENDING")
        
        # Check wallet changes
        resp2 = requests.get(f"{BASE_URL}/wallet", headers=headers)
        wallet = resp2.json()
        # Money should be deducted, dollar pending should increase
        assert wallet["money"]["available"] < 500, "Money not deducted"
        assert wallet["dollar"]["pending"] == 9, f"Expected 9 pending dollars, got {wallet['dollar']['pending']}"
        log(f"✅ Wallet updated: money.available = {wallet['money']['available']}, dollar.pending = 9")
        
        return True
    except Exception as e:
        log(f"❌ Create BUY order failed: {e}")
        return False

def test_insufficient_funds():
    """Test 16: Order with insufficient funds"""
    log("TEST: Order with insufficient funds")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        # Try to buy huge amount
        resp = requests.post(f"{BASE_URL}/orders", headers=headers, json={
            "type": "BUY",
            "listingId": test_state["listing_id_buy"],
            "dollars": 100000
        })
        assert resp.status_code == 400, f"Expected 400 for insufficient funds, got {resp.status_code}"
        assert "insufficient" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Insufficient funds validation working")
        return True
    except Exception as e:
        log(f"❌ Insufficient funds test failed: {e}")
        return False

def test_buy_order_approval():
    """Test 17: Wait for BUY order approval (~50s)"""
    log("TEST: BUY order approval (waiting 50 seconds...)")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        log("⏳ Waiting 50 seconds for mock-admin to approve order...")
        time.sleep(50)
        
        # Check order status
        resp = requests.get(f"{BASE_URL}/orders?type=BUY", headers=headers)
        assert resp.status_code == 200, f"Orders check failed: {resp.status_code}"
        orders = resp.json()["orders"]
        order = next((o for o in orders if o["id"] == test_state["order_id_buy"]), None)
        assert order is not None, "BUY order not found"
        assert order["status"] == "APPROVED", f"Expected APPROVED, got {order['status']}"
        log("✅ BUY order status changed to APPROVED")
        
        # Check wallet
        resp2 = requests.get(f"{BASE_URL}/wallet", headers=headers)
        wallet = resp2.json()
        assert wallet["dollar"]["balance"] == 9, f"Expected 9 dollar balance, got {wallet['dollar']['balance']}"
        assert wallet["dollar"]["pending"] == 0, f"Expected 0 pending dollars, got {wallet['dollar']['pending']}"
        log("✅ Wallet updated: dollar.balance = 9, pending = 0")
        
        # Check notification
        resp3 = requests.get(f"{BASE_URL}/notifications", headers=headers)
        notifs = resp3.json()["notifications"]
        buy_notif = next((n for n in notifs if n["type"] == "BUY_APPROVED"), None)
        assert buy_notif is not None, "BUY_APPROVED notification not found"
        log("✅ BUY_APPROVED notification created")
        
        return True
    except Exception as e:
        log(f"❌ BUY order approval test failed: {e}")
        return False

def test_sell_order_flow():
    """Test 18: SELL order flow"""
    log("TEST: SELL order flow")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    # Quote
    try:
        resp = requests.post(f"{BASE_URL}/orders/quote", headers=headers, json={
            "type": "SELL",
            "listingId": test_state["listing_id_sell"],
            "dollars": 5
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        quote = resp.json()["quote"]
        assert quote["sufficient"] == True, "Should have sufficient dollars"
        expected_inr = quote["amountInr"]
        log(f"✅ SELL quote: $5 @ ₹{quote['rate']}/$ = ₹{expected_inr}")
    except Exception as e:
        log(f"❌ SELL quote failed: {e}")
        return False
    
    # Create SELL order
    try:
        resp = requests.post(f"{BASE_URL}/orders", headers=headers, json={
            "type": "SELL",
            "listingId": test_state["listing_id_sell"],
            "dollars": 5
        })
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        order = resp.json()["order"]
        test_state["order_id_sell"] = order["id"]
        log(f"✅ SELL order created: {order['id']}")
        
        # Check wallet
        resp2 = requests.get(f"{BASE_URL}/wallet", headers=headers)
        wallet = resp2.json()
        assert wallet["dollar"]["balance"] == 4, f"Expected 4 dollar balance, got {wallet['dollar']['balance']}"
        assert wallet["money"]["pending"] > 0, "Money pending should increase"
        log(f"✅ Wallet updated: dollar.balance = 4, money.pending = {wallet['money']['pending']}")
    except Exception as e:
        log(f"❌ SELL order creation failed: {e}")
        return False
    
    # Try selling more than balance
    try:
        resp = requests.post(f"{BASE_URL}/orders", headers=headers, json={
            "type": "SELL",
            "listingId": test_state["listing_id_sell"],
            "dollars": 100
        })
        assert resp.status_code == 400, f"Expected 400 for insufficient dollars, got {resp.status_code}"
        log("✅ Selling more than balance correctly rejected")
    except Exception as e:
        log(f"❌ Insufficient dollars test failed: {e}")
        return False
    
    return True

def test_bank_details_required():
    """Test 19: Withdrawal without bank details"""
    log("TEST: Withdrawal without bank details")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/withdrawals", headers=headers, json={
            "amount": 100
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "bank details" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Withdrawal without bank details correctly rejected")
        return True
    except Exception as e:
        log(f"❌ Bank details required test failed: {e}")
        return False

def test_save_bank_details():
    """Test 20: PUT /api/bank-details with valid and invalid data"""
    log("TEST: Save bank details")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    # Invalid IFSC
    try:
        resp = requests.put(f"{BASE_URL}/bank-details", headers=headers, json={
            "accountHolder": "Test User",
            "bankName": "HDFC",
            "accountNumber": "123456789012",
            "ifsc": "XYZ",
            "upiId": "test@ybl"
        })
        assert resp.status_code == 400, f"Expected 400 for invalid IFSC, got {resp.status_code}"
        log("✅ Invalid IFSC validation working")
    except Exception as e:
        log(f"❌ Invalid IFSC test failed: {e}")
        return False
    
    # Valid bank details
    try:
        resp = requests.put(f"{BASE_URL}/bank-details", headers=headers, json={
            "accountHolder": "Test User",
            "bankName": "HDFC Bank",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "upiId": "testuser@ybl"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        log("✅ Bank details saved successfully")
    except Exception as e:
        log(f"❌ Save bank details failed: {e}")
        return False
    
    return True

def test_get_bank_details():
    """Test 21: GET /api/bank-details (masked)"""
    log("TEST: Get bank details (masked)")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/bank-details", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "bankDetails" in data, "Bank details not in response"
        bd = data["bankDetails"]
        assert bd["accountNumberMasked"].endswith("9012"), "Account number not properly masked"
        assert bd["accountNumberMasked"].startswith("XXXXXX"), "Account number not properly masked"
        assert "****" in bd["upiIdMasked"], "UPI ID not properly masked"
        log(f"✅ Bank details masked: {bd['accountNumberMasked']}, {bd['upiIdMasked']}")
        return True
    except Exception as e:
        log(f"❌ Get bank details failed: {e}")
        return False

def test_withdrawal():
    """Test 22: POST /api/withdrawals with validations"""
    log("TEST: Withdrawal")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    # Amount too low
    try:
        resp = requests.post(f"{BASE_URL}/withdrawals", headers=headers, json={
            "amount": 50
        })
        assert resp.status_code == 400, f"Expected 400 for low amount, got {resp.status_code}"
        assert "minimum" in resp.json().get("message", "").lower(), "Error message not clear"
        log("✅ Minimum withdrawal validation working")
    except Exception as e:
        log(f"❌ Min withdrawal test failed: {e}")
        return False
    
    # Valid withdrawal
    try:
        # First check current balance
        resp_wallet = requests.get(f"{BASE_URL}/wallet", headers=headers)
        current_balance = resp_wallet.json()["money"]["available"]
        
        if current_balance < 100:
            log(f"⚠️  Insufficient balance for withdrawal test (have ₹{current_balance}), skipping")
            return True
        
        resp = requests.post(f"{BASE_URL}/withdrawals", headers=headers, json={
            "amount": 100
        })
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "withdrawal" in data, "Withdrawal not in response"
        wd = data["withdrawal"]
        assert wd["status"] == "PENDING", f"Expected PENDING, got {wd['status']}"
        log(f"✅ Withdrawal created: ₹100, status: PENDING")
        
        # Check balance reduced
        resp2 = requests.get(f"{BASE_URL}/wallet", headers=headers)
        new_balance = resp2.json()["money"]["available"]
        assert new_balance == current_balance - 100, f"Balance not reduced correctly"
        log(f"✅ Balance reduced from ₹{current_balance} to ₹{new_balance}")
    except Exception as e:
        log(f"❌ Withdrawal test failed: {e}")
        return False
    
    # Amount more than balance
    try:
        resp = requests.post(f"{BASE_URL}/withdrawals", headers=headers, json={
            "amount": 999999
        })
        assert resp.status_code == 400, f"Expected 400 for insufficient balance, got {resp.status_code}"
        log("✅ Withdrawal with insufficient balance correctly rejected")
    except Exception as e:
        log(f"❌ Insufficient balance test failed: {e}")
        return False
    
    return True

def test_notifications():
    """Test 24: GET /api/notifications and mark-read"""
    log("TEST: Notifications")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        # Get notifications
        resp = requests.get(f"{BASE_URL}/notifications", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "notifications" in data, "Notifications not in response"
        assert "unread" in data, "Unread count not in response"
        notifs = data["notifications"]
        unread_count = data["unread"]
        log(f"✅ Got {len(notifs)} notifications, {unread_count} unread")
        
        # Mark as read
        if unread_count > 0:
            resp2 = requests.post(f"{BASE_URL}/notifications/mark-read", headers=headers)
            assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
            
            # Verify unread count is 0
            resp3 = requests.get(f"{BASE_URL}/notifications", headers=headers)
            new_unread = resp3.json()["unread"]
            assert new_unread == 0, f"Expected 0 unread, got {new_unread}"
            log("✅ All notifications marked as read")
        
        return True
    except Exception as e:
        log(f"❌ Notifications test failed: {e}")
        return False

def test_unknown_route():
    """Test 25: Unknown route returns 404"""
    log("TEST: Unknown route")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    try:
        resp = requests.get(f"{BASE_URL}/unknown-route-xyz", headers=headers)
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        log("✅ Unknown route returns 404")
        return True
    except Exception as e:
        log(f"❌ Unknown route test failed: {e}")
        return False

def test_logout():
    """Test 6: POST /api/auth/logout"""
    log("TEST: Logout")
    headers = {"Authorization": f"Bearer {test_state['access_token']}"}
    
    try:
        # Logout
        resp = requests.post(f"{BASE_URL}/auth/logout", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        log("✅ Logout successful")
        
        # Try using same token (should fail)
        resp2 = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert resp2.status_code == 401, f"Expected 401 after logout, got {resp2.status_code}"
        log("✅ Access token invalidated after logout")
        
        return True
    except Exception as e:
        log(f"❌ Logout test failed: {e}")
        return False

def main():
    """Run all tests"""
    log("=" * 80)
    log("DEAR DOLLAR Backend API Test Suite")
    log("=" * 80)
    
    results = {}
    
    # Test sequence
    tests = [
        ("API Root", test_api_root),
        ("Community Links (public)", test_community_links),
        ("User Registration", test_register),
        ("Registration Validations", test_register_validations),
        ("User Login", test_login),
        ("Refresh Token Rotation", test_refresh_token),
        ("Auth Me Endpoint", test_auth_me),
        ("Forgot Password", test_forgot_password),
        ("Initial Wallet Balance", test_wallet_initial),
        ("Create Deposit", test_create_deposit),
        ("Deposit Validations", test_deposit_validations),
        ("Submit UTR", test_submit_utr),
        ("Mock-Admin Deposit Approval", test_mock_admin_approval),
        ("Get Listings", test_listings),
        ("Order Quote (BUY)", test_order_quote_buy),
        ("Create BUY Order", test_create_buy_order),
        ("Insufficient Funds", test_insufficient_funds),
        ("BUY Order Approval", test_buy_order_approval),
        ("SELL Order Flow", test_sell_order_flow),
        ("Withdrawal Without Bank Details", test_bank_details_required),
        ("Save Bank Details", test_save_bank_details),
        ("Get Bank Details (Masked)", test_get_bank_details),
        ("Withdrawal", test_withdrawal),
        ("Notifications", test_notifications),
        ("Unknown Route", test_unknown_route),
        ("Logout", test_logout),
    ]
    
    for name, test_func in tests:
        log("")
        log("-" * 80)
        try:
            results[name] = test_func()
        except Exception as e:
            log(f"❌ Test '{name}' crashed: {e}")
            results[name] = False
        log("-" * 80)
    
    # Summary
    log("")
    log("=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {name}")
    
    log("")
    log(f"Total: {passed}/{total} tests passed ({passed*100//total}%)")
    log("=" * 80)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
