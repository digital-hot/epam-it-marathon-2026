using System;
using System.Text.Json.Serialization;

namespace APIHandler.Models.Reservations;

public class EditReservationRequest
{
    [JsonPropertyName("reservationId")]
    public required string ReservationId { get; set; }

    [JsonPropertyName("startTime")]
    public DateTime StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public DateTime EndTime { get; set; }

    [JsonPropertyName("guestCount")]
    public int GuestCount { get; set; }

    /// Optional: when omitted the current setting is kept.
    [JsonPropertyName("hidePricesForGuests")]
    public bool? HidePricesForGuests { get; set; }
}