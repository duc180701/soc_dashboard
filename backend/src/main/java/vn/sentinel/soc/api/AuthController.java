package vn.sentinel.soc.api;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import vn.sentinel.soc.service.UserAccountService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserAccountService accounts;

    public AuthController(UserAccountService accounts) { this.accounts = accounts; }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> body) {
        return accounts.register(body);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body) {
        return accounts.login(body);
    }

    @GetMapping("/me")
    public UserAccountService.UserView currentUser(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return accounts.currentUser(authorization);
    }

    @PatchMapping("/me")
    public UserAccountService.UserView updateProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        return accounts.updateProfile(authorization, body);
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thiếu phiên đăng nhập.");
        accounts.logout(authorization);
        return Map.of("loggedOut", true);
    }
}
