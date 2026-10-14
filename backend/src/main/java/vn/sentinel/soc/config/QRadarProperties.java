package vn.sentinel.soc.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.Map;

@ConfigurationProperties(prefix = "qradar")
public record QRadarProperties(String baseUrl, String token, String version, Map<String, String> queries,
        int searchTimeoutSeconds) {
    public boolean enabled() { return baseUrl != null && !baseUrl.isBlank() && token != null && !token.isBlank(); }
}
