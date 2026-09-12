from app.services.gala.gala_service import auto_table_position


def test_auto_table_position_fills_rows_of_three():
    assert auto_table_position(0) == (40, 28)
    assert auto_table_position(1) == (260, 28)
    assert auto_table_position(2) == (480, 28)
    assert auto_table_position(3) == (40, 228)
