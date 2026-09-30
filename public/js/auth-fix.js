(function(){
  'use strict';

  // Patch PM Sports IQ authentication without changing the legacy application code.
  // The user is already authenticated when the whitelist is checked, so use the
  // session JWT instead of the anonymous key for the allowed_users query.
  window.checkEmailAllowed = async function(email){
    try{
      const sessionResult = await sb.auth.getSession();
      const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      const token = session && session.access_token ? session.access_token : getAuthToken();

      const res = await fetch(
        SUPABASE_URL + '/rest/v1/allowed_users?select=email&email=eq.' + encodeURIComponent(email),
        {headers:{
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + token
        }}
      );

      if(!res.ok){
        const body = await res.text();
        console.error('[PMIQ Auth] whitelist HTTP error', res.status, body);
        const err = document.getElementById('authErr');
        if(err) err.textContent = 'Unable to verify account access (' + res.status + ').';
        return false;
      }

      const data = await res.json();
      return Array.isArray(data) && data.length > 0;
    }catch(e){
      console.error('[PMIQ Auth] whitelist check failed', e);
      const err = document.getElementById('authErr');
      if(err) err.textContent = 'Unable to verify account access. Please try again.';
      return false;
    }
  };

  // Avoid a permanently disabled login button if a downstream access check fails.
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('authBtn');
    const overlay = document.getElementById('loginOverlay');
    if(!btn || !overlay) return;

    const resetIfStillLocked = function(){
      if(overlay.style.display !== 'none' && btn.disabled){
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    };

    window.addEventListener('unhandledrejection', function(ev){
      console.error('[PMIQ Auth] unhandled rejection', ev.reason);
      const err = document.getElementById('authErr');
      if(err && overlay.style.display !== 'none'){
        err.textContent = 'Login completed, but account access could not be loaded.';
      }
      resetIfStillLocked();
    });

    setInterval(resetIfStillLocked, 5000);
  });
})();