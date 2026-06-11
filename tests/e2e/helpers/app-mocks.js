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
      }),
      signInWithPassword: async ({ email, password }) => {
        window.__SUPABASE_CALLS__.push({
          type: 'auth',
          name: 'signInWithPassword',
          args: { email, hasPassword: Boolean(password) }
        });
        await new Promise((resolve) => setTimeout(resolve, 40));
        const message = window.__AUTH_SCENARIO__?.loginError || 'Invalid login credentials';
        return { data: { session: null }, error: { message } };
      },
      signUp: async ({ email, password }) => {
        window.__SUPABASE_CALLS__.push({
          type: 'auth',
          name: 'signUp',
          args: { email, hasPassword: Boolean(password) }
        });
        return { data: { session: null }, error: null };
      },
      resetPasswordForEmail: async (email) => {
        window.__SUPABASE_CALLS__.push({
          type: 'auth',
          name: 'resetPasswordForEmail',
          args: { email }
        });
        return { data: {}, error: null };
      },
      updateUser: async ({ password }) => {
        window.__SUPABASE_CALLS__.push({
          type: 'auth',
          name: 'updateUser',
          args: { hasPassword: Boolean(password) }
        });
        return { data: { user: {} }, error: null };
      },
      signInWithOAuth: async ({ provider }) => {
        window.__SUPABASE_CALLS__.push({
          type: 'auth',
          name: 'signInWithOAuth',
          args: { provider }
        });
        return { data: {}, error: { message: 'MOCK_OAUTH_ERROR' } };
      }
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

const CHAT_SUPABASE_SDK_MOCK = `
(() => {
  const currentUser = {
    id: 'e27daa07-bbda-4c62-91ce-e6586163b5c6',
    email: 'eowert72@gmail.com'
  };
  let messageSequence = 1;

  const nextMessageId = () => {
    const suffix = String(messageSequence++).padStart(12, '0');
    return '10000000-0000-4000-8000-' + suffix;
  };

  const createQuery = (table) => {
    let operation = 'select';
    let values = null;
    const filters = {};

    const execute = () => {
      if (table === 'profiles' && operation === 'select') {
        return { data: { user_id: currentUser.id, nickname: '관리자' }, error: null };
      }

      if (table === 'settlements' && operation === 'select') {
        return { data: { title: '채팅 테스트방' }, error: null };
      }

      if (table === 'chat_messages' && operation === 'select') {
        return { data: [], error: null };
      }

      if (table === 'chat_messages' && operation === 'insert') {
        const message = {
          id: nextMessageId(),
          settlement_id: Number(values[0].settlement_id),
          user_id: values[0].user_id,
          content: values[0].content,
          created_at: new Date().toISOString(),
          is_edited: false,
          is_deleted: false,
          is_hidden_admin: false
        };
        window.__CHAT_MESSAGES__.push(message);
        window.__CHAT_MUTATIONS__.push({ operation, table, values, filters: { ...filters }, result: message });
        setTimeout(() => {
          (window.__CHAT_REALTIME_HANDLERS__.INSERT || []).forEach((handler) => {
            handler({ new: { ...message } });
          });
        }, 0);
        return { data: message, error: null };
      }

      if (table === 'chat_messages' && operation === 'update') {
        const id = filters.id;
        window.__CHAT_MUTATIONS__.push({ operation, table, values, filters: { ...filters } });
        if (!id || String(id).startsWith('temp-')) {
          return {
            data: null,
            error: { message: 'invalid input syntax for type uuid: "' + id + '"' }
          };
        }
        const message = window.__CHAT_MESSAGES__.find((item) => item.id === id);
        if (!message) return { data: null, error: null };
        Object.assign(message, values);
        return { data: { id }, error: null };
      }

      if (table === 'settlement_members' && operation === 'upsert') {
        return { data: values, error: null };
      }

      return { data: [], error: null, count: 0 };
    };

    const query = {
      select() { return query; },
      eq(column, value) { filters[column] = value; return query; },
      neq() { return query; },
      gt() { return query; },
      in() { return query; },
      is() { return query; },
      order() { return query; },
      range() { return query; },
      limit() { return query; },
      insert(nextValues) { operation = 'insert'; values = nextValues; return query; },
      update(nextValues) { operation = 'update'; values = nextValues; return query; },
      upsert(nextValues) { operation = 'upsert'; values = nextValues; return query; },
      delete() { operation = 'delete'; return query; },
      single() { return Promise.resolve(execute()); },
      maybeSingle() { return Promise.resolve(execute()); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    return query;
  };

  const createChannel = () => {
    const channel = {
      on(_type, config, handler) {
        if (config?.table === 'chat_messages' && window.__CHAT_REALTIME_HANDLERS__[config.event]) {
          window.__CHAT_REALTIME_HANDLERS__[config.event].push(handler);
        }
        return channel;
      },
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
      getSession: async () => ({
        data: { session: { user: currentUser } },
        error: null
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } }
      })
    },
    rpc: async (name) => {
      if (name === 'get_my_admin_pin') return { data: null, error: null };
      return { data: null, error: null };
    },
    from: (table) => createQuery(table),
    channel: () => createChannel(),
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
    window.__AUTH_SCENARIO__ = {
      loginError: 'Invalid login credentials'
    };

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

async function installChatMocks(page) {
  await page.addInitScript(() => {
    window.__CHAT_MESSAGES__ = [];
    window.__CHAT_MUTATIONS__ = [];
    window.__CHAT_REALTIME_HANDLERS__ = {
      INSERT: [],
      UPDATE: [],
      DELETE: []
    };

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'denied',
        requestPermission: async () => 'denied'
      }
    });
  });

  await page.route('**/@supabase/supabase-js@2', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: CHAT_SUPABASE_SDK_MOCK
  }));

  await page.route('**/font-awesome/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: ''
  }));
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
  installAppMocks,
  installChatMocks
};
