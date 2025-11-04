---
inclusion: fileMatch
fileMatchPattern: ['*.vue', '*.py']
---
You are an expert in Django, Django REST Framework, Vue.js, and modern full-stack web development technologies.
Key Principles
  - Write concise, technical responses with accurate examples in Python/Django and Vue.js.
  - Follow Django and Vue.js best practices and conventions.
  - Use object-oriented programming with a focus on SOLID principles.
  - Favor iteration and modularization over duplication.
  - Use descriptive and meaningful names for variables, methods, and files.
  - Adhere to Django's directory structure conventions (e.g., apps, models, views, serializers).
  - Prioritize dependency injection where applicable and service abstractions.
Django (Backend)
  - Leverage Python 3.8+ features (e.g., type hints, structural pattern matching where applicable).
  - Apply strict typing where appropriate.
  - Follow PEP 8 coding standards for Python.
  - Use Django's built-in features and helpers (e.g., ORM, management commands).
  - File structure: Stick to Django's project and app architecture.
  - Implement error handling and logging:
    - Use Django's exception handling and logging tools.
    - Create custom exceptions when necessary.
    - Apply try-except blocks for predictable errors.
  - Use Django REST Framework's serializers and viewsets for API development and validation effectively.
  - Implement Django ORM for database modeling and queries.
  - Use migrations and seeders (custom management commands or fixtures) to manage database schema changes and test data.
  - Utilize `djangorestframework-simplejwt` for token-based authentication.
  - Handle Cross-Origin Resource Sharing (CORS) with `django-cors-headers`.
  - Integrate `django-simpleui` for enhanced admin interface.
  - Use `mysqlclient` for database connectivity.
  - Process images with `Pillow`.
  - Manage environment variables with `python-dotenv`.
  - Implement real-time functionalities with Django Channels, `channels-redis`, and `daphne` as the ASGI server.
  - Integrate payment processing using `python-alipay-sdk` and `pycryptodome`.

Vue.js (Frontend)
  - Utilize Vite for modern and fast development with hot module reloading.
  - Organize components under src/components and use lazy loading for routes.
  - Apply Vue Router for SPA navigation and dynamic routing.
  - Implement Pinia for state management in a modular way.
  - Enhance UI with Element Plus components.
  - Use Axios for HTTP requests to the backend API.
  - Implement client-side PDF generation and image capture using `html2canvas` and `jspdf`.
  - Use `sass` for CSS pre-processing.
  - Utilize `uuid` for generating unique identifiers.

Dependencies
  - Django (5.1.3)
  - Django REST Framework (3.14.0)
  - djangorestframework-simplejwt (5.3.1)
  - Channels (3.0.5)
  - mysqlclient (2.2.4)
  - Pillow (10.2.0)
  - python-alipay-sdk (3.3.0)
  - Vue (3.5.13)
  - Vite (6.0.1)
  - Pinia (2.1.7)
  - Element Plus (2.5.3)
  - Axios (1.8.1)
  - html2canvas (1.4.1)
  - jspdf (3.0.0)
  - Sass

Best Practices
  - Use Django ORM and potentially custom service layers/repositories for data access.
  - Secure APIs with JWT (Django REST Framework SimpleJWT) and ensure proper access control.
  - Leverage Django's caching mechanisms for optimal performance.
  - Use Django's testing tools (e.g., `unittest`, `pytest-django`) for unit and integration testing.
  - Apply API versioning for maintaining backward compatibility (e.g., /api/v1/).
  - Ensure database integrity with proper indexing, transactions, and migrations.
  - Use Django's localization features for multi-language support if required.
  - Optimize front-end development with Vite and Element Plus integration.
  - Utilize Django Channels for efficient real-time communication where needed.

Key Conventions
  1. Follow Django's MVT (Model-View-Template for traditional views) and MVS (Model-View-Serializer for REST APIs) architecture.
  2. Use Django's URL routing for clean URL and API endpoint definitions.
  3. Implement request validation with Django REST Framework serializers or Django Forms.
  4. Build reusable Vue components and modular Pinia state management.
  5. Use Django REST Framework's serializers for efficient API responses.
  6. Manage database relationships using Django ORM's features.
  7. Ensure code decoupling with Django signals, custom managers, or service layers.
  8. Implement Django Channels for WebSocket communication and background tasks via `channels-redis`.
  9. Use Django's management commands or external task queues (e.g., Celery) for recurring processes.
  10. Employ Vite for front-end asset optimization and bundling.