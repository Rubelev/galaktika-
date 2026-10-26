using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace galaktika.Web.Auth;

// Простое серверное хранилище пользователей.
// Пароли не хранятся в открытом виде: только соль и PBKDF2-хеш.
public sealed class AuthStore
{
    private sealed class Record
    {
        public string Email { get; set; } = "";
        public string Salt { get; set; } = "";
        public string Hash { get; set; } = "";
        public string Profile { get; set; } = "{}";
        public string Role { get; set; } = "user";
        public DateTime Created { get; set; } = DateTime.UtcNow;
    }

    private readonly string _path;
    private readonly string _dir;
    private readonly object _lock = new();
    private readonly Dictionary<string, Record> _users = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _tokens = new(StringComparer.OrdinalIgnoreCase);

    public AuthStore(string rootPath)
    {
        _dir = Path.Combine(rootPath, "data");
        Directory.CreateDirectory(_dir);
        _path = Path.Combine(_dir, "users.json");
        Load();
        EnsureAdmin();
    }

    private static readonly string[] AdminEmails = { "ab@btema.ru" };

    private static string Norm(string email) => (email ?? "").Trim().ToLowerInvariant();

    public bool IsAdminEmail(string email) => AdminEmails.Contains(Norm(email));

    private void Load()
    {
        if (!File.Exists(_path)) return;
        try
        {
            var json = File.ReadAllText(_path, Encoding.UTF8);
            var list = JsonSerializer.Deserialize<List<Record>>(json) ?? new();
            foreach (var r in list) _users[Norm(r.Email)] = r;
        }
        catch { /* повреждённый файл не должен ронять приложение */ }
    }

    private void Save()
    {
        lock (_lock)
        {
            var list = _users.Values.ToList();
            var json = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_path, json, Encoding.UTF8);
        }
    }

    // Администратор по умолчанию: почта из кода, пароль задаётся один раз.
    private void EnsureAdmin()
    {
        const string email = "ab@btema.ru";
        if (_users.ContainsKey(email)) return;
        Create(email, "Docent@1973Docent", "admin", new
        {
            lastName = "Булатов Алексей Юрьевич",
            gameName = "Rubelev",
            faction = "earth"
        });
    }

    public static (string salt, string hash) HashPassword(string password)
    {
        var saltBytes = RandomNumberGenerator.GetBytes(16);
        var hashBytes = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), saltBytes, 120_000, HashAlgorithmName.SHA256, 32);
        return (Convert.ToBase64String(saltBytes), Convert.ToBase64String(hashBytes));
    }

    public static bool Verify(string password, string salt, string hash)
    {
        try
        {
            var saltBytes = Convert.FromBase64String(salt);
            var expected = Convert.FromBase64String(hash);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), saltBytes, 120_000, HashAlgorithmName.SHA256, 32);
            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
        catch { return false; }
    }

    public (bool ok, string? token, string? error) Register(string email, string password, string role, object profile)
    {
        email = Norm(email);
        if (email.Length < 3 || !email.Contains('@')) return (false, null, "неверная почта");
        if ((password ?? "").Length < 6) return (false, null, "пароль короче 6 символов");
        if (_users.ContainsKey(email)) return (false, null, "такая почта уже есть");

        Create(email, password!, role, profile);
        return (true, Issue(email), null);
    }

    private void Create(string email, string password, string role, object profile)
    {
        var (salt, hash) = HashPassword(password);
        _users[Norm(email)] = new Record
        {
            Email = Norm(email),
            Salt = salt,
            Hash = hash,
            Role = role,
            Profile = JsonSerializer.Serialize(profile)
        };
        Save();
    }

    public (bool ok, string? token, string? role) Login(string email, string password)
    {
        email = Norm(email);
        if (!_users.TryGetValue(email, out var rec)) return (false, null, null);
        if (!Verify(password ?? "", rec.Salt, rec.Hash)) return (false, null, null);
        return (true, Issue(email), rec.Role);
    }

    private string Issue(string email)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        _tokens[token] = Norm(email);
        return token;
    }

    public string? EmailByToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        return _tokens.TryGetValue(token, out var email) ? email : null;
    }

    public (string email, string role, string profile)? Me(string? token)
    {
        var email = EmailByToken(token);
        if (email is null || !_users.TryGetValue(email, out var rec)) return null;
        return (rec.Email, rec.Role, rec.Profile);
    }

    public bool SaveProfile(string? token, string profileJson)
    {
        var email = EmailByToken(token);
        if (email is null || !_users.TryGetValue(email, out var rec)) return false;
        rec.Profile = profileJson;
        Save();
        return true;
    }

    public bool ChangePassword(string? token, string oldPassword, string newPassword)
    {
        var email = EmailByToken(token);
        if (email is null || !_users.TryGetValue(email, out var rec)) return false;
        if (!Verify(oldPassword ?? "", rec.Salt, rec.Hash)) return false;
        if ((newPassword ?? "").Length < 6) return false;
        var (salt, hash) = HashPassword(newPassword);
        rec.Salt = salt; rec.Hash = hash;
        Save();
        return true;
    }
}
