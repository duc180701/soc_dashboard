package vn.sentinel.soc.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserAccountService {
    private static final int SALT_BYTES = 16;
    private static final int HASH_ITERATIONS = 210_000;
    private static final int MAX_IMAGE_CHARS = 1_500_000;
    private final ObjectMapper objectMapper;
    private final Path storePath;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, String> sessions = new ConcurrentHashMap<>();

    public UserAccountService(ObjectMapper objectMapper,
            @Value("${app.user-store.path:./data/users.json}") String storePath) {
        this.objectMapper = objectMapper;
        this.storePath = Path.of(storePath).toAbsolutePath().normalize();
        initializeStore();
    }

    public synchronized Map<String, Object> register(Map<String, Object> input) {
        String username = required(input, "username").trim();
        String password = required(input, "password");
        if (username.length() > 80 || password.length() < 6 || password.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tên đăng nhập hoặc mật khẩu không hợp lệ.");
        }
        List<Account> accounts = readAccounts();
        if (find(accounts, username) != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên đăng nhập đã tồn tại.");
        }
        byte[] salt = new byte[SALT_BYTES];
        secureRandom.nextBytes(salt);
        Account account = new Account(username, encode(salt), hash(password, salt),
                text(input, "fullName"), text(input, "birthDate"), text(input, "jobTitle"),
                text(input, "department"), text(input, "phone"), image(input));
        accounts.add(account);
        writeAccounts(accounts);
        return newSession(account);
    }

    public synchronized Map<String, Object> login(Map<String, Object> input) {
        String username = required(input, "username").trim();
        String password = required(input, "password");
        Account account = find(readAccounts(), username);
        if (account == null || !MessageDigest.isEqual(decode(account.passwordHash()),
                decode(hash(password, decode(account.passwordSalt()))))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không chính xác.");
        }
        return newSession(account);
    }

    public UserView currentUser(String authorization) {
        return view(requireAccount(authorization));
    }

    public synchronized UserView updateProfile(String authorization, Map<String, Object> input) {
        Account current = requireAccount(authorization);
        List<Account> accounts = readAccounts();
        int index = accounts.indexOf(current);
        if (index < 0) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không còn hợp lệ.");
        Account updated = new Account(current.username(), current.passwordSalt(), current.passwordHash(),
                optionalText(input, "fullName", current.fullName()),
                optionalText(input, "birthDate", current.birthDate()),
                optionalText(input, "jobTitle", current.jobTitle()),
                optionalText(input, "department", current.department()),
                optionalText(input, "phone", current.phone()), image(input, current.portrait()));
        accounts.set(index, updated);
        writeAccounts(accounts);
        return view(updated);
    }

    public void logout(String authorization) {
        String token = token(authorization);
        if (token != null) sessions.remove(token);
    }

    private Map<String, Object> newSession(Account account) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, account.username());
        return Map.of("token", token, "user", view(account));
    }

    private Account requireAccount(String authorization) {
        String token = token(authorization);
        String username = token == null ? null : sessions.get(token);
        Account account = username == null ? null : find(readAccounts(), username);
        if (account == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
        return account;
    }

    private String token(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
        return authorization.substring(7).trim();
    }

    private UserView view(Account account) {
        return new UserView(account.username(), account.fullName(), account.birthDate(), account.jobTitle(),
                account.department(), account.phone(), account.portrait());
    }

    private Account find(List<Account> accounts, String username) {
        return accounts.stream().filter(account -> account.username().equalsIgnoreCase(username)).findFirst().orElse(null);
    }

    private String required(Map<String, Object> input, String key) {
        String value = text(input, key);
        if (value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " là bắt buộc.");
        return value;
    }

    private String text(Map<String, Object> input, String key) {
        Object value = input.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private String optionalText(Map<String, Object> input, String key, String previous) {
        return input.containsKey(key) ? text(input, key) : previous;
    }

    private String image(Map<String, Object> input) { return image(input, ""); }

    private String image(Map<String, Object> input, String previous) {
        String value = input.containsKey("portrait") ? text(input, "portrait") : previous;
        if (value.length() > MAX_IMAGE_CHARS) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Ảnh đại diện quá lớn.");
        }
        return value;
    }

    private String hash(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, HASH_ITERATIONS, 256);
        try {
            return encode(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException("Không thể băm mật khẩu.", e);
        } finally {
            spec.clearPassword();
        }
    }

    private String encode(byte[] value) { return Base64.getEncoder().encodeToString(value); }
    private byte[] decode(String value) { return Base64.getDecoder().decode(value); }

    private void initializeStore() {
        try {
            Files.createDirectories(storePath.getParent());
            if (Files.notExists(storePath)) Files.writeString(storePath, "[]\n");
            readAccounts();
        } catch (IOException e) {
            throw new IllegalStateException("Không thể khởi tạo file người dùng: " + storePath, e);
        }
    }

    private List<Account> readAccounts() {
        try {
            List<Account> accounts = objectMapper.readValue(storePath.toFile(), new TypeReference<>() {});
            return accounts == null ? new ArrayList<>() : new ArrayList<>(accounts);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể đọc file người dùng: " + storePath, e);
        }
    }

    private void writeAccounts(List<Account> accounts) {
        Path temporary = storePath.resolveSibling(storePath.getFileName() + ".tmp");
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), accounts);
            try {
                Files.move(temporary, storePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temporary, storePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Không thể ghi file người dùng: " + storePath, e);
        }
    }

    public record UserView(String username, String fullName, String birthDate, String jobTitle,
            String department, String phone, String portrait) {}

    private record Account(String username, String passwordSalt, String passwordHash, String fullName,
            String birthDate, String jobTitle, String department, String phone, String portrait) {}
}
