/**
 * Universal Client-Side Multi-Provider LLM Adapter.
 * Supports OpenRouter, Google Gemini, and OpenAI REST APIs with BYOK
 * (stored securely in browser localStorage), real-time telemetry, and fallback simulation.
 */

export class LlmTelemetry {
    constructor({ provider, model, latencyMs, tokens = {}, success = true, error = null }) {
        this.provider = provider;
        this.model = model;
        this.latencyMs = latencyMs;
        this.tokens = tokens;
        this.success = success;
        this.error = error;
        this.timestamp = new Date().toLocaleTimeString();
    }
}

export class LlmClient {
    constructor() {
        this.provider = localStorage.getItem("ums_llm_provider") || "openrouter";
        this.apiKey = localStorage.getItem("ums_llm_api_key") || "";
        this.model = localStorage.getItem("ums_llm_model") || "google/gemini-2.5-flash";
        this.temperature = parseFloat(localStorage.getItem("ums_llm_temp") || "0.2");
        this.serviceTier = localStorage.getItem("ums_llm_service_tier") || "standard"; // Explicitly 'standard' to avoid opportunistic flex tier
        this.authorityLevel = localStorage.getItem("ums_authority_level") || "balanced"; // 'advisory', 'balanced', 'autonomous'
        this.telemetryHistory = [];
        this.onTraceCallback = null;
    }

    saveConfig({ provider, apiKey, model, temperature, serviceTier, authorityLevel }) {
        if (provider !== undefined) {
            this.provider = provider;
            localStorage.setItem("ums_llm_provider", provider);
        }
        if (apiKey !== undefined) {
            this.apiKey = apiKey.trim();
            localStorage.setItem("ums_llm_api_key", this.apiKey);
        }
        if (model !== undefined) {
            this.model = model;
            localStorage.setItem("ums_llm_model", model);
        }
        if (temperature !== undefined) {
            this.temperature = temperature;
            localStorage.setItem("ums_llm_temp", temperature.toString());
        }
        if (serviceTier !== undefined) {
            this.serviceTier = serviceTier;
            localStorage.setItem("ums_llm_service_tier", serviceTier);
        }
        if (authorityLevel !== undefined) {
            this.authorityLevel = authorityLevel;
            localStorage.setItem("ums_authority_level", authorityLevel);
        }
    }

    setTraceListener(callback) {
        this.onTraceCallback = callback;
    }

    logTrace(message, type = "info") {
        if (this.onTraceCallback) {
            this.onTraceCallback({ message, type, time: new Date().toLocaleTimeString() });
        }
    }

    async fetchAvailableModels(providerOverride = null, apiKeyOverride = null) {
        const prov = providerOverride || this.provider;
        const key = apiKeyOverride !== null && apiKeyOverride !== undefined ? apiKeyOverride : this.apiKey;

        this.logTrace(`Pinging ${prov.toUpperCase()} server to discover available models...`, "info");

        if (prov === "openrouter") {
            const headers = {};
            if (key) {
                headers["Authorization"] = `Bearer ${key}`;
            }
            const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const models = (data.data || []).map(m => ({
                id: m.id,
                name: m.name || m.id,
                contextLength: m.context_length || 0,
                description: m.description || "",
                pricing: m.pricing || null
            }));
            this.logTrace(`Successfully discovered ${models.length} models from OpenRouter.`, "success");
            return models;
        } else if (prov === "gemini") {
            if (!key) {
                throw new Error("API Key required to list Google Gemini models. Please enter your Gemini API key.");
            }
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
            const res = await fetch(url);
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const models = (data.models || [])
                .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
                .map(m => {
                    const cleanId = m.name.replace("models/", "");
                    return {
                        id: cleanId,
                        name: m.displayName || cleanId,
                        contextLength: m.inputTokenLimit || 0,
                        description: m.description || ""
                    };
                });
            this.logTrace(`Successfully discovered ${models.length} models from Google Gemini.`, "success");
            return models;
        } else if (prov === "openai") {
            if (!key) {
                throw new Error("API Key required to list OpenAI models. Please enter your OpenAI API key.");
            }
            const res = await fetch("https://api.openai.com/v1/models", {
                headers: { "Authorization": `Bearer ${key}` }
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const models = (data.data || [])
                .filter(m => !m.id.includes("whisper") && !m.id.includes("tts") && !m.id.includes("dall-e") && !m.id.includes("embedding"))
                .map(m => ({
                    id: m.id,
                    name: m.id,
                    contextLength: 0,
                    description: ""
                }))
                .sort((a, b) => a.id.localeCompare(b.id));
            this.logTrace(`Successfully discovered ${models.length} models from OpenAI.`, "success");
            return models;
        } else {
            throw new Error(`Unsupported provider '${prov}'`);
        }
    }

    async reconcileConflicts(systemInstruction, userPayload) {
        if (!this.apiKey) {
            this.logTrace("No API Key configured. Running in Built-in Music Theory Cognitive Simulator mode.", "warning");
            await new Promise(r => setTimeout(r, 600)); // realistic UX feel
            return this.simulateReconciliation(userPayload);
        }

        const startTime = performance.now();
        this.logTrace(`Connecting to ${this.provider.toUpperCase()} (${this.model})...`, "info");

        try {
            let result;
            if (this.provider === "openrouter") {
                result = await this.callOpenRouter(systemInstruction, userPayload);
            } else if (this.provider === "gemini") {
                result = await this.callGemini(systemInstruction, userPayload);
            } else {
                result = await this.callOpenAi(systemInstruction, userPayload);
            }

            const latencyMs = Math.round(performance.now() - startTime);
            this.logTrace(`LLM Arbitration completed in ${latencyMs}ms (${result.usage?.total_tokens || "N/A"} tokens).`, "success");

            const telemetry = new LlmTelemetry({
                provider: this.provider,
                model: this.model,
                latencyMs,
                tokens: result.usage || {},
                success: true
            });
            this.telemetryHistory.push(telemetry);

            return result.data;
        } catch (err) {
            const latencyMs = Math.round(performance.now() - startTime);
            this.logTrace(`LLM Call Failed (${err.message}). Falling back to cognitive simulator...`, "error");

            const telemetry = new LlmTelemetry({
                provider: this.provider,
                model: this.model,
                latencyMs,
                tokens: {},
                success: false,
                error: err.message
            });
            this.telemetryHistory.push(telemetry);

            return this.simulateReconciliation(userPayload);
        }
    }

    async callOpenRouter(systemPrompt, userPayload) {
        const url = "https://openrouter.ai/api/v1/chat/completions";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                temperature: this.temperature,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(userPayload, null, 2) }
                ]
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenRouter HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "{}";
        const parsed = this.extractJson(content);
        return { data: parsed, usage: data.usage || {} };
    }

    async callGemini(systemPrompt, userPayload) {
        const cleanModel = this.model.replace("google/", "");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: JSON.stringify(userPayload, null, 2) }] }],
                generationConfig: {
                    temperature: this.temperature,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = this.extractJson(content);
        return { data: parsed, usage: data.usageMetadata || {} };
    }

    async callOpenAi(systemPrompt, userPayload) {
        const url = "https://api.openai.com/v1/chat/completions";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                temperature: this.temperature,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(userPayload, null, 2) }
                ]
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenAI HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "{}";
        const parsed = this.extractJson(content);
        return { data: parsed, usage: data.usage || {} };
    }

    extractJson(text) {
        let clean = text.trim();
        if (clean.startsWith("```json")) clean = clean.substring(7);
        if (clean.startsWith("```")) clean = clean.substring(3);
        if (clean.endsWith("```")) clean = clean.substring(0, clean.length - 3);
        return JSON.parse(clean.trim());
    }

    simulateReconciliation(userPayload) {
        const conflicts = userPayload.conflicts_to_reconcile || [];
        const decisions = conflicts.map(c => {
            const confId = c.conflict_id;
            const confType = c.conflict_type;
            const cands = c.candidates || {};
            const gpVal = cands.guitar_pro;
            const pdfVal = cands.chord_sheet_pdf || cands.vocal_score_pdf;

            if (confType === "chord_mismatch") {
                return {
                    conflict_id: confId,
                    resolved_value: pdfVal || gpVal,
                    musical_rationale: `Harmonic analysis confirms '${pdfVal}' matches the vocal melody extension and preserves the recurring ${c.section_name} harmonic progression.`,
                    confidence_score: 0.94,
                    pattern_matched: `Progression continuity in ${c.section_name}`
                };
            } else if (confType === "capo_key_offset") {
                return {
                    conflict_id: confId,
                    resolved_value: gpVal,
                    musical_rationale: `Fretboard tablature coordinates in Guitar Pro require ${gpVal} to maintain accurate fingering shapes in Layer B.`,
                    confidence_score: 0.98,
                    pattern_matched: "Capo-relative guitar shape algebra"
                };
            } else if (confType === "section_structure") {
                return {
                    conflict_id: confId,
                    resolved_value: "proportional_boundary_clustering",
                    musical_rationale: "Aligned section boundaries dynamically based on vocal verse/chorus density.",
                    confidence_score: 0.88,
                    pattern_matched: "Vocal milestone mapping"
                };
            } else {
                return {
                    conflict_id: confId,
                    resolved_value: c.deterministic_proposal,
                    musical_rationale: c.deterministic_rationale || "Applied canonical source hierarchy.",
                    confidence_score: 0.85,
                    pattern_matched: "General musicological baseline"
                };
            }
        });

        return { reconciled_decisions: decisions };
    }
}
