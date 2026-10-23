async function testNotifications() {
  const baseUrl = 'http://localhost:5000';
  console.log('--- Starting Notification API Verification ---');

  try {
    // 1. Preview Recipient Count
    console.log('\n1. Testing recipient preview endpoint...');
    const previewRes = await fetch(`${baseUrl}/api/admin/notifications/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: { roles: ['admin', 'staff', 'delivery', 'accountant'] }
      })
    });
    const previewData = await previewRes.json();
    console.log('Preview Response status:', previewRes.status);
    console.log('Preview Result:', previewData);

    if (previewData.status !== 'success') {
      throw new Error('Preview endpoint failed');
    }

    // 2. Send Broadcast Announcement
    console.log('\n2. Testing send announcement broadcast...');
    const sendRes = await fetch(`${baseUrl}/api/super/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'System Maintenance Alert',
        message: 'This is a test broadcast to all roles.',
        immediate: true,
        filters: { roles: ['admin', 'staff', 'delivery', 'accountant'] },
        actor: 'Super Admin'
      })
    });
    const sendData = await sendRes.json();
    console.log('Send Response status:', sendRes.status);
    console.log('Send Result:', sendData);

    if (sendData.status !== 'success') {
      throw new Error('Send announcement endpoint failed');
    }

    // Delay 1 second to allow background sendAnnouncement promise to complete
    console.log('Waiting 1 second for asynchronous db insertion...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Retrieve Notifications for Admin (demo account 'admin@vyapar.com')
    console.log('\n3. Testing get notifications for specific user...');
    const getRes = await fetch(`${baseUrl}/api/admin/notifications/my?username=admin@vyapar.com`);
    const getData = await getRes.json();
    console.log('Get Response status:', getRes.status);
    console.log(`Retrieved ${getData.notifications ? getData.notifications.length : 0} notifications.`);
    if (getData.notifications && getData.notifications.length > 0) {
      const latest = getData.notifications[0];
      console.log('Latest notification details:', {
        id: latest._id,
        title: latest.title,
        message: latest.message,
        read: latest.read
      });

      // 4. Acknowledge Notification Read
      console.log('\n4. Testing ack notification read...');
      const ackRes = await fetch(`${baseUrl}/api/admin/notifications/ack/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@vyapar.com',
          notificationId: latest._id
        })
      });
      const ackData = await ackRes.json();
      console.log('Ack Response status:', ackRes.status);
      console.log('Ack Result:', ackData);

      if (ackData.status !== 'success') {
        throw new Error('Ack read failed');
      }
    } else {
      console.log('No notifications found for admin@vyapar.com, skipping ack test');
    }

    console.log('\nAll notification API flows completed successfully! ✅');
  } catch (err) {
    console.error('Test script failed with error:', err.message);
  }
}

testNotifications();
