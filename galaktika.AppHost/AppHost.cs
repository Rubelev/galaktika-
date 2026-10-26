/*
==================================================
Автор: Булатов Алексей Юрьевич (1973 г.р.)
Место: г. Люберцы
Проект: Галактика Млечный Путь (Solar System)
==================================================
*/
var builder = DistributedApplication.CreateBuilder(args);
var apiService = builder.AddProject("apiservice", @"..\galaktika.ApiService\galaktika.ApiService.csproj");
var webFrontend = builder.AddProject("webfrontend", @"..\galaktika.Web\galaktika.Web.csproj").WithReference(apiService);
builder.Build().Run();

