package vn.sentinel.soc.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(QRadarProperties.class)
public class HttpConfig {
    @Bean RestClient qradarRestClient(RestClient.Builder builder) { return builder.build(); }
}
