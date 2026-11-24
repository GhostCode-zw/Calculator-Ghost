from django.db import models


class Calculation(models.Model):
    OPERANT_CHOICES = [
        ("+", "Add"),
        ("-", "Subtract"),
        ("/", "Divide"),
        ("*", "Multiply"),
    ]

    num1 = models.FloatField()
    num2 = models.FloatField()
    operant = models.CharField(max_length=1, choices=OPERANT_CHOICES)
    result = models.FloatField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.operant == "+":
            self.result = self.num1 + self.num2
        elif self.operant == "-":
            self.result = self.num1 - self.num2
        elif self.operant == "*":
            self.result = self.num1 * self.num2
        elif self.operant == "/":
            self.result = self.num1 / self.num2 if self.num2 != 0 else None

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.num1} {self.operant} {self.num2} = {self.result}"