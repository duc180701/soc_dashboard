package vn.sentinel.soc.service;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import vn.sentinel.soc.config.QRadarProperties;

@Service
public class QRadarService {
    private static final Logger log = LoggerFactory.getLogger(QRadarService.class);
    private static final DateTimeFormatter AQL_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss'Z'").withZone(ZoneOffset.UTC);
    private final RestClient client;
    private final QRadarProperties properties;
    private final Map<String, Set<String>> activeSearches = new ConcurrentHashMap<>();
    private final Map<String, Long> canceledGroups = new ConcurrentHashMap<>();
    private record QueryResult(String key, Object value, String error, String errorType) {}
    private record ArielQueryResult(List<Map<String, Object>> rows, long totalRows) {}

    public QRadarService(RestClient qradarRestClient, QRadarProperties properties) {
        this.client = qradarRestClient;
        this.properties = properties;
    }

    /** Executes the dashboard's separate, configurable AQL metrics over one exact time window. */
    public Map<String, Object> dashboard(Instant from, Instant to) {
        if (!properties.enabled()) return Map.of("connected", false, "mode", "demo");

        Map<String, String> queries = metricQueries(from, to);

        Map<String, Object> metrics = new LinkedHashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, String> errorTypes = new LinkedHashMap<>();
        queries.entrySet().stream().map(entry -> CompletableFuture.supplyAsync(() -> {
            try {
                return new QueryResult(entry.getKey(), queryCount(entry.getValue(), entry.getKey()), null, null);
            } catch (Exception e) {
                return new QueryResult(entry.getKey(), null, describe(e), errorType(e));
            }
        })).toList().forEach(future -> {
            try {
                QueryResult result = future.get(queryTimeoutSeconds() + 5L, TimeUnit.SECONDS);
                if (result.value() != null) metrics.put(result.key(), result.value());
                if (result.error() != null) {
                    errors.put(result.key(), result.error());
                    errorTypes.put(result.key(), result.errorType());
                }
            } catch (Exception e) {
                log.error("[QRADAR] QRadar dashboard query wait failed: detail={}", describe(e));
                future.cancel(true);
                errors.put("query", describe(e));
                errorTypes.put("query", errorType(e));
            }
        });
        boolean any = !metrics.isEmpty();
        if (!any) {
            String firstErrorType = errorTypes.values().stream().findFirst().orElse("unknown");
            return Map.of("connected", false, "mode", "error", "errorType", firstErrorType,
                    "error", errors.values().stream().findFirst().orElse("QRadar không trả dữ liệu."),
                    "metrics", metrics, "metricErrors", errors, "metricErrorTypes", errorTypes, "from", from.toString(), "to", to.toString());
        }
        return Map.of("connected", true, "mode", "qradar", "metrics", metrics, "metricErrors", errors,
                "metricErrorTypes", errorTypes, "from", from.toString(), "to", to.toString());
    }

    public Map<String, Object> metric(String key, Instant from, Instant to) { return metric(key, from, to, null); }

    public Map<String, Object> metric(String key, Instant from, Instant to, String queryGroup) {
        if (!properties.enabled()) return Map.of("key", key, "live", false, "errorType", "configuration", "error", "QRADAR_BASE_URL/QRADAR_TOKEN chưa được cấu hình.");
        String query = metricQueries(from, to).get(key);
        if (query == null) return Map.of("key", key, "live", false, "errorType", "configuration", "error", "KPI key không hợp lệ: " + key);
        try {
            Object value = queryCount(query, key, queryGroup);
            return Map.of("key", key, "value", value, "live", true, "aql", query);
        } catch (Exception e) {
            return Map.of("key", key, "live", false, "errorType", errorType(e), "error", describe(e), "aql", query);
        }
    }

    public Map<String, Object> eventSeries(Instant from, Instant to, int bucketMinutes) { return eventSeries(from, to, bucketMinutes, null); }

    public Map<String, Object> eventSeries(Instant from, Instant to, int bucketMinutes, String queryGroup) {
        if (!properties.enabled()) return Map.of("live", false, "error", "QRadar chưa được cấu hình.");
        int safeBucket = List.of(5, 15, 60, 240).contains(bucketMinutes) ? bucketMinutes : 60;
        long bucketMillis = safeBucket * 60_000L;
        String query = queryTemplate("event-series", Map.of("bucketMillis", bucketMillis), from, to);
        try {
            return Map.of("live", true, "bucketMinutes", safeBucket, "rows", queryRows(query, "eventSeries", queryGroup),
                    "from", from.toString(), "to", to.toString(), "aql", query);
        } catch (Exception e) {
            return Map.of("live", false, "error", describe(e), "errorType", errorType(e), "aql", query);
        }
    }

    public Map<String, Object> solutionBreakdown(Instant from, Instant to) { return solutionBreakdown(from, to, null); }

    public Map<String, Object> solutionBreakdown(Instant from, Instant to, String queryGroup) {
        if (!properties.enabled()) return Map.of("live", false, "error", "QRadar chưa được cấu hình.");
        String query = queryTemplate("solution-breakdown", Map.of(), from, to);
        try {
            return Map.of("live", true, "rows", queryRows(query, "solutionBreakdown", queryGroup),
                    "from", from.toString(), "to", to.toString(), "aql", query);
        } catch (Exception e) {
            return Map.of("live", false, "error", describe(e), "errorType", errorType(e), "aql", query);
        }
    }

    public Map<String, Object> topSources(Instant from, Instant to, String queryGroup) {
        if (!properties.enabled()) return Map.of("live", false, "error", "QRadar chưa được cấu hình.");
        String query = queryTemplate("top-sources", Map.of(), from, to);
        try {
            return Map.of("live", true, "rows", queryRows(query, "topSources", queryGroup),
                    "from", from.toString(), "to", to.toString(), "aql", query);
        } catch (Exception e) {
            return Map.of("live", false, "error", describe(e), "errorType", errorType(e), "aql", query);
        }
    }

    public Map<String, Object> attackTypes(Instant from, Instant to, String queryGroup) {
        return queryList("attack-types", "attackTypes", from, to, queryGroup);
    }

    public Map<String, Object> countryDistribution(Instant from, Instant to, String queryGroup) {
        return queryList("country-distribution", "countryDistribution", from, to, queryGroup);
    }

    public Map<String, Object> vietnamProvinces(Instant from, Instant to, String queryGroup) {
        return queryList("vietnam-provinces", "vietnamProvinces", from, to, queryGroup);
    }

    public Map<String, Object> recentFlows(Instant from, Instant to, String queryGroup) {
        return queryList("recent-flows", "recentFlows", from, to, queryGroup);
    }

    public Map<String, Object> allFlows(Instant from, Instant to, int page, int pageSize, String queryGroup) {
        if (!properties.enabled()) return Map.of("live", false, "error", "QRadar chưa được cấu hình.");
        int safePage = Math.max(0, page);
        int safePageSize = Math.max(1, Math.min(30, pageSize));
        int rangeStart = safePage * safePageSize;
        String query = queryTemplate("all-flows", Map.of(), from, to);
        try {
            ArielQueryResult result = queryRows(query, "allFlows", queryGroup, rangeStart, safePageSize);
            long totalRows = result.totalRows();
            return Map.of("live", true, "rows", result.rows(), "page", safePage, "pageSize", safePageSize,
                    "totalRows", totalRows, "totalPages", totalRows == 0 ? 0 : (totalRows + safePageSize - 1) / safePageSize,
                    "from", from.toString(), "to", to.toString(), "aql", query);
        } catch (Exception e) {
            return Map.of("live", false, "error", describe(e), "errorType", errorType(e), "aql", query);
        }
    }

    private Map<String, Object> queryList(String queryKey, String metric, Instant from, Instant to, String queryGroup) {
        if (!properties.enabled()) return Map.of("live", false, "error", "QRadar chưa được cấu hình.");
        String query = queryTemplate(queryKey, Map.of(), from, to);
        try {
            return Map.of("live", true, "rows", queryRows(query, metric, queryGroup),
                    "from", from.toString(), "to", to.toString(), "aql", query);
        } catch (Exception e) {
            return Map.of("live", false, "error", describe(e), "errorType", errorType(e), "aql", query);
        }
    }

    private Map<String, String> metricQueries(Instant from, Instant to) {
        Map<String, String> queries = new LinkedHashMap<>();
        queries.put("events", queryTemplate("events", Map.of(), from, to));
        queries.put("alerts", queryTemplate("alerts", Map.of(), from, to));
        queries.put("blockedAlerts", queryTemplate("blocked-alerts", Map.of(), from, to));
        queries.put("protectedSystems", queryTemplate("protected-systems", Map.of(), from, to));
        queries.put("activeSolutions", queryTemplate("active-solutions", Map.of(), from, to));
        queries.put("severityHigh", queryTemplate("severity-high", Map.of(), from, to));
        queries.put("severityMedium", queryTemplate("severity-medium", Map.of(), from, to));
        queries.put("severityLow", queryTemplate("severity-low", Map.of(), from, to));
        return queries;
    }

    private String describe(Exception exception) {
        Throwable cause = exception;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        String detail;
        if (exception instanceof RestClientResponseException response) {
            detail = "QRadar HTTP " + response.getStatusCode().value() + ": " + response.getResponseBodyAsString();
        } else if (cause instanceof RestClientResponseException response) {
            detail = "QRadar HTTP " + response.getStatusCode().value() + ": " + response.getResponseBodyAsString();
        } else if (exception instanceof ResourceAccessException || cause instanceof ResourceAccessException) {
            detail = "Không kết nối được QRadar: " + cause.getClass().getSimpleName() + optionalMessage(cause);
        } else {
            detail = cause.getClass().getSimpleName() + optionalMessage(cause);
        }
        if (properties.token() != null && !properties.token().isBlank()) detail = detail.replace(properties.token(), "[REDACTED]");
        detail = detail.replaceAll("https?://[^\\s'\"]+", "[QRADAR_URL]");
        detail = detail.replaceAll("[\\r\\n\\t]+", " ");
        return detail.substring(0, Math.min(detail.length(), 500));
    }

    private String errorType(Exception exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof RestClientResponseException response) {
                int status = response.getStatusCode().value();
                if (status == 422) return "aql";
                if (status == 401 || status == 403) return "auth";
                return "api";
            }
            if (cause instanceof ResourceAccessException || cause instanceof java.io.IOException
                    || cause instanceof javax.net.ssl.SSLException || cause instanceof java.net.SocketException) return "connection";
            if (cause instanceof IllegalStateException state && state.getMessage() != null
                    && state.getMessage().contains("Ariel search status=")) return "search";
        }
        return "unknown";
    }

    private String optionalMessage(Throwable throwable) {
        return throwable.getMessage() == null || throwable.getMessage().isBlank() ? "" : ": " + throwable.getMessage();
    }

    private int queryTimeoutSeconds() {
        return Math.max(10, properties.searchTimeoutSeconds());
    }

    private String queryTemplate(String key, Map<String, ?> variables, Instant from, Instant to) {
        String query = properties.queries() == null ? null : properties.queries().get(key);
        if (query == null || query.isBlank()) throw new IllegalStateException("Thiếu AQL template '" + key + "' trong qradar-queries.yml");
        Map<String, Object> resolvedVariables = new LinkedHashMap<>();
        resolvedVariables.put("from", AQL_TIME.format(from));
        resolvedVariables.put("to", AQL_TIME.format(to));
        resolvedVariables.putAll(variables);
        for (Map.Entry<String, ?> variable : resolvedVariables.entrySet()) {
            query = query.replace("{{" + variable.getKey() + "}}", String.valueOf(variable.getValue()));
        }
        if (query.matches("(?s).*\\{\\{[^}]+}}.*")) throw new IllegalStateException("AQL template '" + key + "' còn biến chưa được truyền.");
        return query.trim();
    }

    private Object queryCount(String query, String metric) {
        return queryCount(query, metric, null);
    }

    private Object queryCount(String query, String metric, String queryGroup) {
        List<Map<String, Object>> rows = queryRows(query, metric, queryGroup);
        if (rows.isEmpty()) return 0;
        Map<String, Object> row = rows.get(0);
        Object value = row.get(metricAlias(metric));
        if (value == null && row.containsKey("COUNT(*)")) value = row.get("COUNT(*)");
        if (value == null) value = row.values().stream().findFirst().orElse(0);
        return value == null ? 0 : value;
    }

    private List<Map<String, Object>> queryRows(String query, String metric) {
        return queryRows(query, metric, null);
    }

    private List<Map<String, Object>> queryRows(String query, String metric, String queryGroup) {
        return queryRows(query, metric, queryGroup, null, null).rows();
    }

    private ArielQueryResult queryRows(String query, String metric, String queryGroup, int offset, int limit) {
        return queryRows(query, metric, queryGroup, Integer.valueOf(offset), Integer.valueOf(limit));
    }

    private ArielQueryResult queryRows(String query, String metric, String queryGroup, Integer offset, Integer limit) {
        String stage = "tạo Ariel search";
        long startedAt = System.nanoTime();
        String id = null;
        try {
            String base = properties.baseUrl().replaceAll("/$", "");
            log.info("{} QRadar AQL query submitted: metric={}, AQL=[{}]", logPrefix(metric), metric, query);
            URI searchUri = UriComponentsBuilder.fromUriString(base + "/api/ariel/searches")
                    .queryParam("query_expression", query).build().encode().toUri();
            Map<?, ?> search = client.post().uri(searchUri).headers(this::auth)
                    .contentType(MediaType.APPLICATION_JSON).retrieve().body(Map.class);
            Object searchId = search == null ? null : search.get("search_id");
            if (searchId == null && search != null) searchId = search.get("cursor_id");
            if (searchId == null) throw new IllegalStateException("QRadar không trả search_id/cursor_id");
            id = String.valueOf(searchId);
            if (queryGroup != null && !queryGroup.isBlank()) {
                activeSearches.computeIfAbsent(queryGroup, ignored -> ConcurrentHashMap.newKeySet()).add(id);
                if (isCanceled(queryGroup)) {
                    cancelRemoteSearch(id, metric);
                    throw new java.util.concurrent.CancellationException("Dashboard query group was canceled");
                }
            }
            log.info("{} QRadar Ariel search accepted: metric={}, searchId={}, status={}", logPrefix(metric), metric, id,
                    search.get("status"));
            long deadline = System.nanoTime() + Duration.ofSeconds(queryTimeoutSeconds()).toNanos();
            long nextProgressLog = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            String status = "EXECUTE";
            int progress = -1;
            stage = "chờ Ariel search hoàn tất";
            while (System.nanoTime() < deadline && !"COMPLETED".equalsIgnoreCase(status)) {
                Thread.sleep(1000);
                Map<?, ?> state = client.get().uri(base + "/api/ariel/searches/" + id).headers(this::auth).retrieve().body(Map.class);
                status = state == null ? "ERROR" : String.valueOf(state.get("status")).trim();
                if (state != null && state.get("progress") instanceof Number value) progress = value.intValue();
                if (System.nanoTime() >= nextProgressLog) {
                    log.info("{} QRadar Ariel search running: metric={}, searchId={}, status={}, progress={}%, elapsedMs={}",
                            logPrefix(metric), metric, id, status, progress, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
                    nextProgressLog = System.nanoTime() + Duration.ofSeconds(10).toNanos();
                }
                if ("ERROR".equalsIgnoreCase(status) || "CANCELED".equalsIgnoreCase(status)) break;
            }
            if (!"COMPLETED".equalsIgnoreCase(status)) throw new IllegalStateException(
                    "Ariel search status=" + status + ", progress=" + progress + "%, searchId=" + id
                            + ("EXECUTE".equalsIgnoreCase(status) ? "; QRadar đang xử lý đến hết timeout " + queryTimeoutSeconds() + "s" : ""));
            stage = "lấy Ariel search results";
            org.springframework.http.ResponseEntity<Map> response = client.get().uri(base + "/api/ariel/searches/" + id + "/results").headers(headers -> {
                auth(headers);
                if (offset != null && limit != null) headers.set("Range", "items=" + offset + "-" + (offset + limit - 1));
            }).retrieve().toEntity(Map.class);
            Map<?, ?> results = response.getBody();
            Object resultRows = results == null ? null : results.get("events");
            List<Map<String, Object>> rows = new java.util.ArrayList<>();
            if (resultRows instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> row) {
                        Map<String, Object> mapped = new LinkedHashMap<>();
                        row.forEach((key, value) -> mapped.put(String.valueOf(key), value));
                        rows.add(mapped);
                    }
                }
            }
            long totalRows = parseContentRangeTotal(response.getHeaders().getFirst("Content-Range"), rows.size(), offset);
            log.info("{} QRadar AQL query completed: metric={}, rows={}, elapsedMs={}, AQL=[{}]", logPrefix(metric), metric, rows.size(),
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt), query);
            return new ArielQueryResult(rows, totalRows);
        } catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            String detail = describe(e);
            log.error("{} QRadar KPI query failed: metric={}, stage={}, elapsedMs={}, AQL=[{}], detail={}",
                    logPrefix(metric), metric, stage, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt), query, detail);
            throw new IllegalStateException(detail, e);
        } finally {
            if (queryGroup != null && id != null) {
                Set<String> searches = activeSearches.get(queryGroup);
                if (searches != null) {
                    searches.remove(id);
                    if (searches.isEmpty()) activeSearches.remove(queryGroup, searches);
                }
            }
        }
    }

    private long parseContentRangeTotal(String contentRange, int rowsReturned, Integer offset) {
        if (contentRange != null) {
            int slash = contentRange.lastIndexOf('/');
            if (slash >= 0 && slash + 1 < contentRange.length()) {
                try { return Long.parseLong(contentRange.substring(slash + 1).trim()); }
                catch (NumberFormatException ignored) { }
            }
        }
        return offset == null ? rowsReturned : (long) offset + rowsReturned;
    }

    public void cancelQueries(String queryGroup) {
        if (queryGroup == null || !queryGroup.matches("[A-Za-z0-9-]{1,80}")) return;
        canceledGroups.put(queryGroup, System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(2));
        activeSearches.getOrDefault(queryGroup, Set.of()).forEach(id -> cancelRemoteSearch(id, "dashboard"));
        canceledGroups.entrySet().removeIf(entry -> entry.getValue() < System.currentTimeMillis());
    }

    private boolean isCanceled(String queryGroup) {
        Long expiresAt = canceledGroups.get(queryGroup);
        if (expiresAt == null) return false;
        if (expiresAt < System.currentTimeMillis()) {
            canceledGroups.remove(queryGroup, expiresAt);
            return false;
        }
        return true;
    }

    private void cancelRemoteSearch(String id, String metric) {
        try {
            String base = properties.baseUrl().replaceAll("/$", "");
            client.delete().uri(base + "/api/ariel/searches/" + id).headers(this::auth).retrieve().toBodilessEntity();
            log.info("{} QRadar Ariel search canceled: metric={}, searchId={}", logPrefix(metric), metric, id);
        } catch (Exception e) {
            log.debug("{} Unable to cancel QRadar Ariel search: metric={}, searchId={}, detail={}", logPrefix(metric), metric, id, e.getMessage());
        }
    }

    private String logPrefix(String metric) {
        return switch (metric) {
            case "events" -> "[TSSK]";
            case "alerts" -> "[TSCB]";
            case "blockedAlerts" -> "[CBDC]";
            case "protectedSystems" -> "[HTBV]";
            case "activeSolutions" -> "[GPTD]";
            case "severityHigh", "severityMedium", "severityLow" -> "[PLMDCB]";
            case "eventSeries" -> "[SLSDKTT]";
            case "solutionBreakdown" -> "[CBTGPBM]";
            case "topSources" -> "[TNT]";
            case "attackTypes" -> "[SKTLTA]";
            case "countryDistribution" -> "[PBSDKL]";
            case "vietnamProvinces" -> "[PBTTVN]";
            case "recentFlows" -> "[LTTG]";
            case "allFlows" -> "[TTCL]";
            default -> "[QRADAR]";
        };
    }

    private String metricAlias(String metric) {
        return switch (metric) {
            case "blockedAlerts" -> "blocked_alerts";
            case "protectedSystems" -> "protected_systems";
            case "activeSolutions" -> "active_solutions";
            case "severityHigh" -> "severity_high";
            case "severityMedium" -> "severity_medium";
            case "severityLow" -> "severity_low";
            default -> "total_" + metric;
        };
    }

    private void auth(org.springframework.http.HttpHeaders headers) {
        headers.set("SEC", properties.token());
        headers.set("Version", properties.version() == null || properties.version().isBlank() ? "24.0" : properties.version());
        headers.set("Accept", "application/json");
        headers.set("User-Agent", "Sentinel-SOC-Dashboard/1.0");
    }
}
