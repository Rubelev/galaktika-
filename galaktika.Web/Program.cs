using galaktika.Web.Components;
using galaktika.Web.Auth;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Серверное хранилище пользователей: пароли проверяются здесь, не в браузере.
var dataRoot = Environment.GetEnvironmentVariable("GALAKTIKA_DATA")
    ?? Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "data");
builder.Services.AddSingleton(new AuthStore(Path.GetFullPath(dataRoot)));

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// ---------------- API авторизации ----------------
static string? Token(HttpRequest req) =>
    req.Headers.TryGetValue("X-Auth-Token", out var v) ? v.ToString() : null;

app.MapPost("/api/auth/login", (AuthStore store, LoginReq req) =>
{
    var (ok, token, role) = store.Login(req.Email, req.Password);
    if (!ok) return Results.Unauthorized();
    var me = store.Me(token);
    return Results.Ok(new { token, role, profile = me?.profile });
});

app.MapPost("/api/auth/register", (AuthStore store, RegisterReq req) =>
{
    var profile = new
    {
        lastName = req.LastName,
        gameName = req.GameName,
        faction = req.Faction,
        credits = 80000,
        hasSeenLegend = false
    };
    var role = store.IsAdminEmail(req.Email) ? "admin" : "user";
    var (ok, token, error) = store.Register(req.Email, req.Password, role, profile);
    if (!ok) return Results.BadRequest(new { error });
    return Results.Ok(new { token, role, profile = System.Text.Json.JsonSerializer.Serialize(profile) });
});

app.MapGet("/api/auth/me", (AuthStore store, HttpRequest req) =>
{
    var me = store.Me(Token(req));
    return me is null
        ? Results.Unauthorized()
        : Results.Ok(new { email = me.Value.email, role = me.Value.role, profile = me.Value.profile });
});

app.MapPost("/api/auth/profile", (AuthStore store, HttpRequest req, ProfileReq body) =>
{
    var ok = store.SaveProfile(Token(req), body.Profile);
    return ok ? Results.Ok(new { saved = true }) : Results.Unauthorized();
});

app.MapPost("/api/auth/password", (AuthStore store, HttpRequest req, PasswordReq body) =>
{
    var ok = store.ChangePassword(Token(req), body.OldPassword, body.NewPassword);
    return ok ? Results.Ok(new { changed = true }) : Results.BadRequest(new { error = "не удалось сменить пароль" });
});

app.MapGet("/api/health", () => Results.Ok(new { ok = true, time = DateTime.UtcNow }));

app.Run();

record LoginReq(string Email, string Password);
record RegisterReq(string Email, string Password, string LastName, string GameName, string Faction);
record ProfileReq(string Profile);
record PasswordReq(string OldPassword, string NewPassword);
