package vn.sentinel.soc.api;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import vn.sentinel.soc.service.QRadarService;

@RestController
@RequestMapping("/api")
public class DashboardController {
    private final QRadarService qradar;

    public DashboardController(QRadarService qradar) { this.qradar = qradar; }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "24h") String period) {
        TimeRange range = timeRange(from, to, period);
        Instant start = range.from();
        Instant end = range.to();
        Map<String, Object> connection = qradar.dashboard(start, end);
        Map<?, ?> liveMetrics = connection.get("metrics") instanceof Map<?, ?> map ? map : Map.of();
        Map<?, ?> metricErrors = connection.get("metricErrors") instanceof Map<?, ?> map ? map : Map.of();
        List<Map<String, Object>> kpis = List.of(
                kpi("events", "10390416", liveMetrics, metricErrors),
                kpi("alerts", "981", liveMetrics, metricErrors),
                kpi("blockedAlerts", "34", liveMetrics, metricErrors),
                kpi("protectedSystems", "947", liveMetrics, metricErrors),
                kpi("activeSolutions", "6", liveMetrics, metricErrors));
        return Map.of("kpis", kpis, "qradar", connection,
                "range", Map.of("from", start.toString(), "to", end.toString()),
                "updatedAt", Instant.now().atOffset(ZoneOffset.ofHours(7)).toString());
    }

    @GetMapping("/dashboard/metric")
    public Map<String, Object> metric(@RequestParam String key,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup,
            @RequestParam(defaultValue = "24h") String period) {
        TimeRange range = timeRange(from, to, period);
        Map<String, Object> result = new java.util.LinkedHashMap<>(qradar.metric(key, range.from(), range.to(), queryGroup));
        result.put("range", Map.of("from", range.from().toString(), "to", range.to().toString()));
        return result;
    }

    @GetMapping("/dashboard/timeseries")
    public Map<String, Object> timeseries(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "24h") String period,
            @RequestParam(defaultValue = "60") int bucketMinutes,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.eventSeries(range.from(), range.to(), bucketMinutes, queryGroup);
    }

    @GetMapping("/dashboard/solutions")
    public Map<String, Object> solutions(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.solutionBreakdown(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/sources")
    public Map<String, Object> sources(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.topSources(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/attack-types")
    public Map<String, Object> attackTypes(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to, @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.attackTypes(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/geography")
    public Map<String, Object> geography(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to, @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.countryDistribution(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/geography/vietnam")
    public Map<String, Object> vietnamGeography(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to, @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.vietnamProvinces(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/flows/recent")
    public Map<String, Object> recentFlows(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to, @RequestParam(defaultValue = "24h") String period,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.recentFlows(range.from(), range.to(), queryGroup);
    }

    @GetMapping("/dashboard/flows")
    public Map<String, Object> flows(@RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to, @RequestParam(defaultValue = "24h") String period,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int pageSize,
            @RequestHeader(value = "X-Dashboard-Query-Group", required = false) String queryGroup) {
        TimeRange range = timeRange(from, to, period);
        return qradar.allFlows(range.from(), range.to(), page, pageSize, queryGroup);
    }

    @DeleteMapping("/dashboard/queries/{queryGroup}")
    public Map<String, Object> cancelQueries(@PathVariable String queryGroup) {
        qradar.cancelQueries(queryGroup);
        return Map.of("canceled", true);
    }

    private TimeRange timeRange(Instant from, Instant to, String period) {
        Instant end = to == null ? Instant.now() : to;
        Instant start;
        if (from != null || to != null) {
            if (from == null || to == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from and to must be provided together");
            start = from;
        } else {
            Duration duration = switch (period) {
                case "24h" -> Duration.ofHours(24);
                case "12h" -> Duration.ofHours(12);
                case "6h" -> Duration.ofHours(6);
                case "1h" -> Duration.ofHours(1);
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "period must be 1h, 6h, 12h, or 24h");
            };
            start = end.minus(duration);
        }
        if (!start.isBefore(end)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be earlier than to");
        return new TimeRange(start, end);
    }

    private record TimeRange(Instant from, Instant to) {}

    private Map<String, Object> kpi(String key, Object demoValue, Map<?, ?> metrics, Map<?, ?> errors) {
        boolean live = metrics.containsKey(key);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("key", key);
        result.put("value", live ? metrics.get(key) : demoValue);
        result.put("live", live);
        if (errors.containsKey(key)) result.put("error", errors.get(key));
        return result;
    }

    @GetMapping("/health")
    public Map<String, Object> health() { return Map.of("status", "UP", "service", "sentinel-soc-api"); }
}
