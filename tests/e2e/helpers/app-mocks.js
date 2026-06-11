const PUBLIC_SETTLEMENT = {
  id: 99001,
  title: '자동 테스트 여행',
  date: '2026-06-11',
  participants: ['민지', '준호'],
  base_currency: 'KRW',
  is_settled: false,
  user_id: null,
  invite_code: 'TEST01',
  deleted_at: null,
  expenses: [
    {
      id: 101,
      name: '첫날 점심',
      original_amount: 30000,
      currency: 'KRW',
      amount: 30000,
      payer: '민지',
      split: 'equal',
      shares: { '민지': 15000, '준호': 15000 },
      expense_date: '2026-06-09T12:00:00+09:00',
      created_at: '2026-06-09T12:00:00+09:00'
    },
    {
      id: 102,
      name: '공항철도',
      original_amount: 12000,
      currency: 'KRW',
      amount: 12000,
      payer: '준호',
      split: 'equal',
      shares: { '민지': 6000, '준호': 6000 },
      expense_date: '2026-06-11T09:30:00+09:00',
      created_at: '2026-06-11T09:30:00+09:00'
    },
    {
      id: 103,
      name: '카페',
      original_amount: 5000,
      currency: 'KRW',
      amount: 5000,
      payer: '민지',
      split: 'equal',
      shares: { '민지': 2500, '준호': 2500 },
      expense_date: '2026-06-10T15:00:00+09:00',
      created_at: '2026-06-10T15:00:00+09:00'
    }
  ]
};

const SUPABASE_SDK_MOCK = `
(() => {
  const createQuery = (table) => {
    const query = {
      select() { return query; },
      eq() { return query; },
      neq() { return query; },
      gt() { return query; },
      in() { return query; },
      is() { return query; },
      order() { return query; },
      limit() { return query; },
      single() { return Promise.resolve({ data: null, error: { message: 'MOCK_NOT_FOUND' } }); },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(resolve, reject) {
        return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
      }
    };

    ['insert', 'update', 'upsert', 'delete'].forEach((operation) => {
      query[operation] = (...args) => {
        window.__SUPABASE_CALLS__.push({ type: 'mutation', table, operation, args });
        throw new Error('TEST_BLOCKED_DATABASE_MUTATION');
      };
    });

    return query;
  };

  const createChannel = (name) => {
    const channel = {
      on() { return channel; },
      subscribe(callback) {
        if (typeof callback === 'function') setTimeout(() => callback('SUBSCRIBED'), 0);
        return channel;
      },
      unsubscribe() { return Promise.resolve(); },
      track() { return Promise.resolve(); },
      send() { return Promise.resolve(); },
      presenceState() { return {}; }
    };
    return channel;
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } }
      })
    },
    rpc: async (name, args) => {
      window.__SUPABASE_CALLS__.push({ type: 'rpc', name, args });
      if (name === 'get_public_settlement_by_invite_code') {
        return { data: window.__PUBLIC_SETTLEMENT__, error: null };
      }
      if (name === 'get_settlement_id_by_invite_code') {
        return { data: window.__PUBLIC_SETTLEMENT__.id, error: null };
      }
      throw new Error('TEST_BLOCKED_RPC_' + name);
    },
    from: (table) => createQuery(table),
    channel: (name) => createChannel(name),
    removeChannel: async () => {},
    realtime: { connect() {} }
  };

  window.supabase = { createClient: () => client };
})();
`;

async function installAppMocks(page, settlement = PUBLIC_SETTLEMENT) {
  await page.addInitScript((fixture) => {
    window.__PUBLIC_SETTLEMENT__ = fixture;
    window.__SUPABASE_CALLS__ = [];

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'denied',
        requestPermission: async () => 'denied'
      }
    });
  }, settlement);

  await page.route('**/@supabase/supabase-js@2', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: SUPABASE_SDK_MOCK
  }));

  await page.route('**/font-awesome/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: ''
  }));

  await page.route('**/qrcode.min.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.QRCode=function(){};window.QRCode.CorrectLevel={H:"H"};'
  }));

  await page.route('**/xlsx.bundle.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX={};'
  }));

  await page.route('**/html-to-image.min.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.htmlToImage={toPng:async()=>\"data:image/png;base64,\"};'
  }));

  await page.route('https://unpkg.com/html5-qrcode', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.Html5Qrcode=class{start(){return Promise.resolve()}stop(){return Promise.resolve()}clear(){}};'
  }));

  await page.route('**/*.supabase.co/**', (route) => {
    if (route.request().method() !== 'GET') {
      return route.abort('blockedbyclient');
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null })
    });
  });
}

async function firstVisibleExpenseName(page) {
  const mobileCards = page.locator('#expense-card-list');
  if (await mobileCards.isVisible()) {
    return page.locator('#expense-card-list .expense-card h3').first().textContent();
  }

  return page.locator('#expense-table tbody tr').first().locator('td').first().locator('div').last().textContent();
}

module.exports = {
  PUBLIC_SETTLEMENT,
  firstVisibleExpenseName,
  installAppMocks
};
