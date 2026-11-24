from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .models import Calculation


@csrf_exempt
def calculate_view(request):
    if request.method == "GET":
        items = list(
            Calculation.objects.order_by("-id").values(
                "id", "num1", "num2", "operant", "result"
            )
        )
        return JsonResponse({"calculations": items})

    if request.method == "POST":
        try:
            data = json.loads(request.body)
            num1 = float(data["num1"])
            num2 = float(data["num2"])
            operant = data["operant"]
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            return JsonResponse(
                {"error": "Provide valid JSON with 'num1', 'num2', and 'operant' (+, -, *, /)."},
                status=400,
            )

        if operant == "/" and num2 == 0:
            return JsonResponse({"error": "Cannot divide by zero."}, status=400)

        calc = Calculation.objects.create(num1=num1, num2=num2, operant=operant)
        return JsonResponse(
            {
                "id": calc.id,
                "num1": calc.num1,
                "num2": calc.num2,
                "operant": calc.operant,
                "result": calc.result,
            },
            status=201,
        )

    return JsonResponse({"error": "Method not allowed."}, status=405)