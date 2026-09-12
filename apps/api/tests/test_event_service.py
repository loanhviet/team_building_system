import pytest

from app.core.errors import AppError
from app.models.enums import EventStatus, UserRole
from app.models.event import Event
from app.services.event_service import transition_event


def make_event(status: EventStatus) -> Event:
    event = Event(code="TB", name="Team Building")
    event.status = status
    event.published_at = None
    return event


def test_organizer_can_move_forward():
    event = make_event(EventStatus.draft)
    transition_event(event, EventStatus.registration_open, UserRole.organizer)
    assert event.status == EventStatus.registration_open


def test_organizer_cannot_skip_ahead():
    event = make_event(EventStatus.registration_open)
    with pytest.raises(AppError):
        transition_event(event, EventStatus.event_completed, UserRole.organizer)
    assert event.status == EventStatus.registration_open


def test_super_admin_can_override_any_transition():
    event = make_event(EventStatus.registration_open)
    transition_event(event, EventStatus.event_completed, UserRole.super_admin)
    assert event.status == EventStatus.event_completed


def test_same_status_is_rejected_as_no_op():
    event = make_event(EventStatus.registration_open)
    with pytest.raises(AppError):
        transition_event(event, EventStatus.registration_open, UserRole.super_admin)


def test_publishing_sets_published_at_once():
    event = make_event(EventStatus.allocation_processing)
    transition_event(event, EventStatus.information_published, UserRole.organizer)
    first_published_at = event.published_at
    assert first_published_at is not None

    # Organizer can't move backward, but super_admin forcing back to
    # published again shouldn't reset the original published_at.
    transition_event(event, EventStatus.registration_open, UserRole.super_admin)
    transition_event(event, EventStatus.information_published, UserRole.super_admin)
    assert event.published_at == first_published_at
