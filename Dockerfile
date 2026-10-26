# Образ не собирает проект — он только запускает готовую автономную сборку.
# Сама сборка делается на машине разработчика:
#   dotnet publish galaktika.Web -c Release -r linux-x64 --self-contained true -o publish/linux-x64
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0
WORKDIR /app
COPY publish/linux-x64/ ./
RUN chmod +x ./galaktika.Web
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} ./galaktika.Web"]