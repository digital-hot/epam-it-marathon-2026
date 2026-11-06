using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public record SubmitGroupPreOrderRequest(
    [property: JsonPropertyName("reservationId")] string ReservationId);

public record ConsolidatedOrderItemResponse(
    [property: JsonPropertyName("dishId")] string DishId,
    [property: JsonPropertyName("quantity")] int Quantity);

