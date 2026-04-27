export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "My Games Backend API",
      version: "1.0.0",
      description: "Scalar API docs for local testing.",
    },
    servers: [
      {
        url: baseUrl,
        description: "Local",
      },
    ],
    tags: [
      { name: "Auth" },
      { name: "Games" },
      { name: "Users" },
      { name: "Screenshot" },
      { name: "IGDB" },
      { name: "Statistics" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        RegisterRequest: {
          type: "object",
          required: ["email", "name", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "test@example.com",
            },
            name: { type: "string", example: "Kadir Test" },
            password: { type: "string", example: "123456" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "test@example.com",
            },
            password: { type: "string", example: "123456" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "test@example.com",
            },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string", example: "1234567" },
          },
        },
        EditUserRequest: {
          type: "object",
          properties: {
            name: { type: "string", example: "Updated User" },
            password: { type: "string", example: "new-password-123" },
            profileImage: {
              type: "string",
              format: "uri",
              example: "https://picsum.photos/200",
            },
          },
        },
        AddGameRequest: {
          type: "object",
          required: ["name", "platform", "status", "playTime"],
          properties: {
            name: { type: "string", example: "Cyberpunk 2077" },
            photo: { type: "string", example: "https://picsum.photos/400/600" },
            lastPlay: {
              type: "string",
              format: "date-time",
              example: "2026-04-26T10:00:00.000Z",
            },
            platform: {
              type: "string",
              enum: [
                "steam",
                "epicGames",
                "ubisoft",
                "xboxPc",
                "eaGames",
                "torrent",
                "playstation",
                "xboxSeries",
                "nintendo",
                "mobile",
                "otherPlatforms",
              ],
              default: "steam",
            },
            review: { type: "string", example: "Great game" },
            rating: { type: "number", minimum: 0, maximum: 10, default: 8.5 },
            status: {
              type: "string",
              enum: [
                "completed",
                "abandoned",
                "toBeCompleted",
                "activePlaying",
              ],
              default: "activePlaying",
            },
            playTime: { type: "number", minimum: 0, default: 10 },
            isFavorite: { type: "boolean", default: false },
            firstFinished: {
              type: "string",
              format: "date-time",
              example: "2026-04-20T10:00:00.000Z",
            },
            steamAppId: { type: "integer", example: 1091500 },
            igdb: {
              type: "object",
              nullable: true,
              example: {
                id: 1877,
                name: "Cyberpunk 2077",
                rating: 87,
              },
            },
          },
        },
        AddTextScreenshotRequest: {
          type: "object",
          required: ["type", "payload"],
          properties: {
            type: { type: "string", enum: ["text"], default: "text" },
            payload: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Boss Fight" },
                  url: {
                    type: "string",
                    format: "uri",
                    example: "https://picsum.photos/1200/700",
                  },
                },
                required: ["url"],
              },
              example: [
                { name: "Mission 1", url: "https://picsum.photos/1200/701" },
                { name: "Mission 2", url: "https://picsum.photos/1200/702" },
              ],
            },
          },
        },
        EditTextScreenshotRequest: {
          type: "object",
          properties: {
            name: { type: "string", example: "Updated Screenshot Name" },
            url: {
              type: "string",
              format: "uri",
              example: "https://picsum.photos/1200/800",
            },
          },
        },
        BulkDeleteScreenshotRequest: {
          type: "object",
          required: ["screenshotIds"],
          properties: {
            screenshotIds: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              example: ["6808f4b33a2b95f0fa6ef999"],
            },
          },
        },
        IgdbUpdateGameRequest: {
          type: "object",
          required: ["mongoId"],
          properties: {
            mongoId: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
          },
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterRequest" },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/forgotpassword": {
        post: {
          tags: ["Auth"],
          summary: "Send reset password email",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/resetpassword": {
        put: {
          tags: ["Auth"],
          summary: "Reset password",
          parameters: [
            {
              name: "resetPasswordToken",
              in: "query",
              required: true,
              schema: { type: "string", example: "token_here" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/edit": {
        put: {
          tags: ["Auth"],
          summary: "Edit profile",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EditUserRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/validateEmail": {
        post: {
          tags: ["Auth"],
          summary: "Validate email",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/verifyAccount": {
        put: {
          tags: ["Auth"],
          summary: "Verify account",
          parameters: [
            {
              name: "verificationToken",
              in: "query",
              required: true,
              schema: { type: "string", example: "verification_token" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/games/add": {
        post: {
          tags: ["Games"],
          summary: "Add game",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddGameRequest" },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/games/user/{id}": {
        get: {
          tags: ["Games"],
          summary: "List user games",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef010" },
            },
            {
              name: "sortBy",
              in: "query",
              required: false,
              schema: { type: "string", example: "createdAt" },
            },
            {
              name: "order",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
              },
            },
            {
              name: "search",
              in: "query",
              required: false,
              schema: { type: "string", example: "cyber" },
            },
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 25 },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/games/game/{game_id}": {
        get: {
          tags: ["Games"],
          summary: "Get game detail",
          parameters: [
            {
              name: "game_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/games/delete/{id}": {
        delete: {
          tags: ["Games"],
          summary: "Delete game",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/games/edit/{id}": {
        put: {
          tags: ["Games"],
          summary: "Edit game",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddGameRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/users": {
        get: {
          tags: ["Users"],
          summary: "Get users",
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/users/{id}": {
        get: {
          tags: ["Users"],
          summary: "Get single user",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef010" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/users/deleteUser/{id}": {
        delete: {
          tags: ["Users"],
          summary: "Delete user (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef010" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/screenshot/{game_id}": {
        get: {
          tags: ["Screenshot"],
          summary: "Get game screenshots",
          parameters: [
            {
              name: "game_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 20 },
            },
            {
              name: "sortBy",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["createdAt", "updatedAt", "name", "type"],
                default: "createdAt",
              },
            },
            {
              name: "order",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
              },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/screenshot/get/random/{count}": {
        get: {
          tags: ["Screenshot"],
          summary: "Get random screenshots",
          parameters: [
            {
              name: "count",
              in: "path",
              required: true,
              schema: { type: "integer", default: 5 },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/screenshot/add/{game_id}": {
        post: {
          tags: ["Screenshot"],
          summary: "Add screenshots",
          description:
            "Use application/json for text payload test. For image upload, switch to multipart/form-data.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "game_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AddTextScreenshotRequest",
                },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/screenshot/edit/{game_id}/{screenshot_id}": {
        put: {
          tags: ["Screenshot"],
          summary: "Edit screenshot",
          description:
            "Use application/json for text update. For image update, use multipart/form-data.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "game_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
            {
              name: "screenshot_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef999" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/EditTextScreenshotRequest",
                },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/screenshot/delete/{game_id}": {
        delete: {
          tags: ["Screenshot"],
          summary: "Delete screenshots (single or bulk)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "game_id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef001" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BulkDeleteScreenshotRequest",
                },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/igdb": {
        get: {
          tags: ["IGDB"],
          summary: "Search IGDB",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "search",
              in: "query",
              required: false,
              schema: { type: "string", default: "witcher" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["IGDB"],
          summary: "Update single game IGDB data (admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IgdbUpdateGameRequest" },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/igdb/{gameId}": {
        get: {
          tags: ["IGDB"],
          summary: "Get single IGDB game",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "gameId",
              in: "path",
              required: true,
              schema: { type: "integer", default: 1877 },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/igdb/all": {
        put: {
          tags: ["IGDB"],
          summary: "Update all games IGDB data (admin)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics": {
        get: {
          tags: ["Statistics"],
          summary: "Get statistics",
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["Statistics"],
          summary: "Update statistics (admin)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics/{id}": {
        get: {
          tags: ["Statistics"],
          summary: "Get user statistics",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "6808f4b33a2b95f0fa6ef010" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  } as const;
}
