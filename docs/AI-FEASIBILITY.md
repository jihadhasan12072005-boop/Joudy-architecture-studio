# AI feasibility: Syria access and the €5/month budget

Checked on **5 November 2026**. Provider policies change often, so check the links again before you enable AI.

## 1. Can Joudy legally use a major AI API from Syria?

| Provider | Syria listed as supported? | Source |
|---|---|---|
| OpenAI API | **No.** The help center says unlisted locations are unsupported, and that "accessing or offering access to our services outside" the list may lead to suspension. A community thread from Aug 2026 shows developers in Syria still blocked. | [Supported countries](https://developers.openai.com/api/docs/supported-countries), [community thread](https://community.openai.com/t/openai-availability-in-syria/1388903) |
| Anthropic (Claude) API | **No**, as far as I could verify. Secondary sources list Syria as excluded. Check the official page directly. | [Supported regions](https://www.anthropic.com/supported-countries) |
| Google Gemini API / AI Studio | **No.** Syria is not on the available-regions page. A Sep 2026 developer-forum thread asks when it will be added and has no answer. | [Available regions](https://ai.google.dev/gemini-api/docs/available-regions), [forum thread](https://discuss.ai.google.dev/t/timeline-for-adding-syria-to-the-available-regions-for-the-gemini-api-and-google-ai-studio/183930) |
| Mistral | **Unclear.** The terms require sanctions compliance and appear to limit the API to business customers. I found no published country list. | [Commercial terms](https://legal.mistral.ai/terms/commercial-terms-of-service) |

Background: US country-wide Syria sanctions were largely lifted in 2025 (Executive Order 14312, 30 June 2025). GitHub restored full access for Syrian developers in September 2025. AI providers have **not** yet followed, as far as these sources show.

### Why "the account is in Spain" does not fix this

Routing Joudy's requests through a backend whose provider account is registered in Spain would still give a provider's service to an end user in an unsupported region. OpenAI's terms say outright that "offering access" outside the list can lead to suspension. That would be a way around a geographic restriction, which this project rules out. **So the AI integration is built and tested but switched off** (`AI_ENABLED = "false"`).

### What it takes to enable it

Enable the assistant only when one of these is true:
1. A capable multimodal provider officially lists Syria as supported (re-check the pages above), **or**
2. A provider's terms clearly allow an end user in Syria (for example, a provider with no regional restrictions whose terms and sanctions screening permit it).

At that point you only need configuration, no code. The worker speaks the widely supported **OpenAI-compatible `/chat/completions` format**, so you can switch providers by changing `PROVIDER_BASE_URL`, `PROVIDER_MODEL` and the two prices.

How to choose the model when the time comes:
- It must accept image input and handle Arabic well. Test it with 5–10 of Joudy's real drawings and questions before you commit.
- Pick the cheapest "flash/mini/haiku"-class multimodal tier. Larger models cost 5–20× more and will exhaust €5 quickly.
- Check the data-handling terms. Prefer providers that don't train on API data by default.

## 2. The €5 budget: how it is enforced

The cap is **€4.50/month by default** (`MONTHLY_LIMIT_EUR`). The code never allows more than €5.

1. **Server-side hard cap (implemented and tested).** Before every request, the worker *reserves* the worst case: (estimated input tokens + the full `MAX_OUTPUT_TOKENS`) × configured prices × 1.25 safety margin. It does this in a single Durable Object, so concurrent requests are serialized. If the reservation would exceed the monthly cap, the request is refused **before** the provider is called. After the reply, the reservation is replaced by the actual cost from the provider's `usage` field.
2. **Conservative estimates.** Arabic is estimated at 1 token per 2 characters, and each image at 1,800 tokens (configurable).
3. **Request limits.** At most 2 images per message, each ≤1.5 MB after in-browser downscaling to 1536 px JPEG. At most 12 messages of history; only the newest message carries images. Text is limited to 24k characters, and there are 60 requests per day.
4. **Provider-side cap (strongly recommended).** Also set a spending limit or prepaid credit in the provider's console. The worker's ledger relies on the prices *you* configure. If the provider raises prices and you don't update the variables, only a provider-side cap protects you.

**Remaining limitation:** if the provider doesn't return `usage`, the worker keeps the conservative reserved amount. Real cost is then lower than recorded, which errs on the safe side. Exchange-rate changes are handled by `USD_TO_EUR`; set it a little high.

### Order-of-magnitude example (illustrative prices, not a quote)

Assume a budget multimodal model at $0.10 per million input tokens and $0.40 per million output tokens, with USD→EUR at 0.95. A drawing-review request with one image, project context and an 800-token answer uses about 4,000 input and 800 output tokens:
`(4,000 × 0.10 + 800 × 0.40) / 1e6 × 0.95 ≈ €0.0007`.
At those prices €4.50 would cover thousands of requests. More expensive models could cover only tens or hundreds. **Check current prices before choosing.** The app shows the cost of every reply and the month's total.

## 3. Hosting the backend

Cloudflare Workers free plan: 100k requests/day, with SQLite-backed Durable Objects on the free plan. Workers run in Cloudflare's network, and the worker only calls the provider. Joudy's browser talks to `*.workers.dev`. I have **not** tested reachability from Syria. Cloudflare's terms bar sanctioned *parties*, not the country as such. Test it from Joudy's connection once deployed.

Recurring cost: **€0 hosting + AI usage capped at €4.50**.
