import { RegistrationService } from './application/REG/RegistrationService.js';
import { Role } from './domain/REG/Role.js';
import { pool } from './db.js';

async function runTests() {
  const regService = new RegistrationService();
  const testUsername = `testuser_${Date.now()}`;
  const testEmail = `${testUsername}@example.com`;

  console.log('--- STARTING REGISTRATION SERVICE TESTS ---');

  
  try {
    // 1. Test Field Validation (Missing username)
    console.log('\nTest 1: Testing missing username validation...');
    try {
      await regService.registerAccount('', 'pass123', 'test@test.com', Role.CUSTOMER);
      console.error('❌ Failed: Allowed empty username.');
    } catch (err: any) {
      console.log('✅ Passed: Rejected empty username with message ->', err.message);
    }

    // 2. Test Successful Registration (Customer)
    console.log('\nTest 2: Registering a new customer account...');
    const customerAcc = await regService.registerAccount(
      testUsername,
      'securepass123',
      testEmail,
      Role.CUSTOMER,
      { deliveryAddress: '1455 De Maisonneuve', city: 'Montreal', country: 'Canada' }
    );
    console.log('✅ Passed: Created account in DB with ID ->', customerAcc.accountID);

    // 3. Test Duplicate Username Check
    console.log('\nTest 3: Checking duplicate username prevention...');
    try {
      await regService.registerAccount(testUsername, 'otherpass', 'other@email.com', Role.CUSTOMER);
      console.error('❌ Failed: Allowed duplicate username.');
    } catch (err: any) {
      console.log('✅ Passed: Caught duplicate username with message ->', err.message);
    }

    // 4. Test findAccountByName
    console.log('\nTest 4: Finding created account by username...');
    const foundAcc = await regService.findAccountByName(testUsername);
    if (foundAcc && foundAcc.accountName === testUsername) {
      console.log('✅ Passed: Found account in DB ->', foundAcc.accountName, `(${foundAcc.role})`);
    } else {
      console.error('❌ Failed: Could not retrieve account.');
    }

    // 5. Cleanup Test Record from DB
    console.log('\nCleaning up test record...');
    await pool.query('DELETE FROM public."Customer" WHERE "accountID" = $1;', [customerAcc.accountID]);
    await pool.query('DELETE FROM public."Account" WHERE "accountID" = $1;', [customerAcc.accountID]);
    console.log('✅ Cleaned up successfully.');

  } catch (error) {
    console.error('Unexpected test error:', error);
  } finally {
    await pool.end();
    console.log('\n--- TESTS COMPLETE ---');
  }
}

runTests();