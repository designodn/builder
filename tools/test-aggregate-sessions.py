#!/usr/bin/env python3
"""
test-aggregate-sessions.py — unittest для compute_leaderboard().

Прогон: `python3 tools/test-aggregate-sessions.py` (или `-m unittest`).
Подключён к smoke-tests workflow — крутится в CI на каждый PR,
который трогает агрегатор или сам тест.

Импорт через importlib, потому что в имени `aggregate-sessions.py`
дефис, и обычный `import` не работает.
"""

import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "agg", Path(__file__).parent / "aggregate-sessions.py"
)
agg = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agg)


def _record_minimal(**kwargs) -> dict:
    """Минимальные обязательные поля telemetry — что нужно extract_telemetry.

    Использует ComputeDriftSummaryTest и любые тесты, которые проверяют
    логику, не зависящую от pulse/import_success. Если drift когда-то
    начнёт читать эти поля, тесты сломаются громко, не тихо.
    """
    defaults = {
        "session_id": "s-test",
        "designer_login": "alice",
        "component": "Button/Primary",
    }
    return {**defaults, **kwargs}


def _record_full(**kwargs) -> dict:
    """Полная запись с pulse и import_success — для leaderboard-тестов."""
    return _record_minimal(
        **{"import_success": True, "pulse": {"mood": "positive"}, **kwargs}
    )


class ComputeLeaderboardTest(unittest.TestCase):
    def _record(self, **kwargs) -> dict:
        return _record_full(**kwargs)

    def test_empty(self):
        out = agg.compute_leaderboard([])
        self.assertIn("Всего сессий:** 0", out)
        self.assertNotIn("Personal thanks", out)

    def test_old_records_hide_personal_thanks_section(self):
        records = [
            self._record(session_id="s1"),
            self._record(session_id="s2", import_success=False, pulse={"mood": "skipped"}),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Всего сессий:** 2", out)
        self.assertNotIn(
            "Personal thanks", out,
            "секция скрыта, пока ни у одной записи нет новых полей",
        )

    def test_personal_thanks_section_with_mixed_records(self):
        records = [
            # Старые записи без поля — не считаются.
            self._record(session_id="s1"),
            self._record(session_id="s2"),
            # Новые записи.
            self._record(
                session_id="s3",
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="s4",
                personal_thanks_emitted=False,
                user_feedback_baseline_source="search",
                pulse={"mood": "negative"},
            ),
            self._record(
                session_id="s5",
                personal_thanks_emitted=True,
                user_feedback_baseline_source="list",
            ),
            self._record(
                session_id="s6",
                personal_thanks_emitted=False,
                user_feedback_baseline_source=None,
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Personal thanks", out)
        # 4 записи с personal_thanks_emitted (s3..s6), из них 2 = true.
        self.assertIn("Сессий с полем `personal_thanks_emitted`:** 4", out)
        self.assertIn("`personal_thanks_emitted = true`:** 2 (50%)", out)
        # baseline_source: 2 search, 1 list, 1 null.
        self.assertIn("search:** 2", out)
        self.assertIn("list (fallback):** 1", out)
        self.assertIn("null (упало или kill-switch):** 1", out)
        # 3 из 4 собрались (search+list) → 75%.
        self.assertIn("75% от сессий", out)
        # Без `other`-значений секция other не появляется.
        self.assertNotIn("— other:", out)

    def test_baseline_source_other_bucket(self):
        """Дрейф значений: незнакомая строка должна показаться явно."""
        records = [
            self._record(
                session_id="s1",
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="s2",
                personal_thanks_emitted=True,
                user_feedback_baseline_source="unknown",  # дрейф!
            ),
            self._record(
                session_id="s3",
                personal_thanks_emitted=True,
                user_feedback_baseline_source="typo-here",  # ещё дрейф
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("— other:** 2", out)
        # Конкретные значения попадают в скобки, чтобы понятно что чинить.
        self.assertIn("typo-here", out)
        self.assertIn("unknown", out)
        # `unknown`/`typo-here` НЕ считаются как «собрался».
        # search=1 из total=3 → 33%.
        self.assertIn("33% от сессий", out)

    def test_baseline_only_null(self):
        """Все упали (или kill-switch) — секция должна сказать 0% собрался."""
        records = [
            self._record(
                session_id="s1",
                personal_thanks_emitted=False,
                user_feedback_baseline_source=None,
            ),
            self._record(
                session_id="s2",
                personal_thanks_emitted=False,
                user_feedback_baseline_source=None,
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Personal thanks", out)
        self.assertIn("`personal_thanks_emitted = true`:** 0 (0%)", out)
        self.assertIn("null (упало или kill-switch):** 2", out)
        self.assertIn("0% от сессий", out)

    def test_record_without_pulse_does_not_crash(self):
        """Старые записи могут не иметь pulse вообще."""
        records = [{"session_id": "s1", "designer_login": "a", "component": "X"}]
        out = agg.compute_leaderboard(records)
        self.assertIn("Всего сессий:** 1", out)

    def test_special_chars_in_component_name_escaped(self):
        """`|` экранируется как `\\|`, backtick заменяется на похожий `ʼ`.

        Если кто-то поменяет символ-замену в `compute_leaderboard`,
        этот тест сломается — обоснованно, как сигнал.
        """
        records = [
            self._record(component="weird|name`with`pipes"),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("weird\\|nameʼwithʼpipes", out)

    def test_baseline_source_without_personal_thanks_emitted(self):
        """Поля могут присутствовать асимметрично: только baseline_source без emit-флага.

        Секция включается через `pt_total or baseline_total` —
        этот тест ловит ветку «pt_total == 0 && baseline_total > 0».
        """
        records = [
            # Записи с baseline_source, но без personal_thanks_emitted.
            self._record(session_id="s1", user_feedback_baseline_source="search"),
            self._record(session_id="s2", user_feedback_baseline_source=None),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Personal thanks", out)
        # pt_total == 0 → строка emit покажет 0.
        self.assertIn("Сессий с полем `personal_thanks_emitted`:** 0", out)
        # baseline_total == 2.
        self.assertIn("search:** 1", out)
        self.assertIn("null (упало или kill-switch):** 1", out)
        # 1 из 2 = 50%.
        self.assertIn("50% от сессий", out)

    def test_skipped_gates_section_hidden_without_fields(self):
        """A-056: секция скрыта, пока ни у одной записи нет gate-полей."""
        records = [
            self._record(session_id="s1", stages={"figma_build": True}),
        ]
        out = agg.compute_leaderboard(records)
        self.assertNotIn("Пропущенные gate'ы", out)

    def test_auto_mode_sessions_excluded_from_leaderboard(self):
        """adversarial /test --full сессии не должны попадать в leaderboard.

        `_session.auto_mode = true` ставится на Шаге 0.5 test.md. Если
        фильтр исчезнет — A-056 метрики начнут включать synthetic-сессии
        и быстро деградируют.
        """
        records = [
            self._record(session_id="real", designer_login="alice"),
            self._record(session_id="auto", designer_login="alice", auto_mode=True),
        ]
        out = agg.compute_leaderboard(records)
        # «Всего сессий» считает только real. auto-запись отфильтрована.
        self.assertIn("**Всего сессий:** 1", out)

    def test_skipped_gates_only_counts_figma_build(self):
        """A-056: сессии без `figma_build = true` в знаменатель не идут.

        Если дизайнер бросил сессию на CJM/чек-листе и не дошёл до Figma —
        отсутствие апрувов это норма, не пропущенный gate.
        """
        records = [
            self._record(
                session_id="s1",
                stages={"figma_build": False},
                i_approval_received=False,
                checklist_approved=False,
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertNotIn("Пропущенные gate'ы", out)

    def test_skipped_gates_all_passed_shows_zero_percent(self):
        """A-056: happy path — все сессии прошли оба gate'а, 0% пропусков.

        Позитивный контроль: секция всё равно появляется (есть поля),
        счётчики пропусков = 0, процент = 0. Защита от регрессии,
        где «секция скрыта при 0 пропусков» может выглядеть как тихое
        исчезновение метрики.
        """
        records = [
            self._record(
                session_id="s1",
                stages={"figma_build": True},
                i_approval_received=True,
                checklist_approved=True,
            ),
            self._record(
                session_id="s2",
                stages={"figma_build": True},
                i_approval_received=True,
                checklist_approved=True,
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Пропущенные gate'ы перед Figma (A-056)", out)
        self.assertIn("telemetry-полями:** 2", out)
        self.assertIn("Пропустили I-апрув (Шаг 6 раскладка):** 0", out)
        self.assertIn("Пропустили чек-лист (Шаг 7 содержимое):** 0", out)
        self.assertIn("Любой из двух gate'ов пропущен:** 0 (0%)", out)

    def test_skipped_gates_asymmetric_field_presence(self):
        """A-056: одно поле присутствует, другое отсутствует.

        Зафиксировано: если хоть одно из gate-полей задано, сессия идёт
        в знаменатель; недостающее поле трактуется как `not True`,
        т.е. как пропущенный gate. Это нужно, чтобы будущий
        «оптимизатор» условия фильтрации не сломал поведение молча.
        """
        records = [
            # Только i_approval_received, без checklist_approved.
            self._record(
                session_id="s1",
                stages={"figma_build": True},
                i_approval_received=True,
            ),
            # Только checklist_approved, без i_approval_received.
            self._record(
                session_id="s2",
                stages={"figma_build": True},
                checklist_approved=True,
            ),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Пропущенные gate'ы перед Figma (A-056)", out)
        # Обе сессии в знаменателе — у каждой есть хотя бы одно поле.
        self.assertIn("telemetry-полями:** 2", out)
        # s2 missing i_approval_received → 1 пропущен.
        self.assertIn("Пропустили I-апрув (Шаг 6 раскладка):** 1", out)
        # s1 missing checklist_approved → 1 пропущен.
        self.assertIn("Пропустили чек-лист (Шаг 7 содержимое):** 1", out)
        # Обе сессии пропустили хотя бы один gate → 2 из 2 = 100%.
        self.assertIn("Любой из двух gate'ов пропущен:** 2 (100%)", out)

    def test_skipped_gates_counts_both_axes(self):
        """A-056: счётчики по каждому gate'у и по обобщённому «любой пропущен»."""
        records = [
            # Оба апрува — чисто.
            self._record(
                session_id="s1",
                stages={"figma_build": True},
                i_approval_received=True,
                checklist_approved=True,
            ),
            # Только I-апрув — чек-лист пропущен.
            self._record(
                session_id="s2",
                stages={"figma_build": True},
                i_approval_received=True,
                checklist_approved=False,
            ),
            # Оба пропущены.
            self._record(
                session_id="s3",
                stages={"figma_build": True},
                i_approval_received=False,
                checklist_approved=False,
            ),
            # Старая запись без полей — не в знаменатель.
            self._record(session_id="s4", stages={"figma_build": True}),
        ]
        out = agg.compute_leaderboard(records)
        self.assertIn("Пропущенные gate'ы перед Figma (A-056)", out)
        # gate_total = 3 (s1..s3), s4 без полей не учитывается.
        self.assertIn("telemetry-полями:** 3", out)
        # I-апрув пропустили s3 → 1.
        self.assertIn("Пропустили I-апрув (Шаг 6 раскладка):** 1", out)
        # Чек-лист пропустили s2 и s3 → 2.
        self.assertIn("Пропустили чек-лист (Шаг 7 содержимое):** 2", out)
        # Любой пропущен — s2 и s3 → 2 из 3 = 67%.
        self.assertIn("Любой из двух gate'ов пропущен:** 2 (67%)", out)


class ComputeDriftSummaryTest(unittest.TestCase):
    """Тесты для compute_drift_summary — секции дрейфа в /fbAnalyzer digest."""

    NOW = datetime(2026, 5, 17, 12, 0, tzinfo=timezone.utc)

    def _ts(self, days_ago: float) -> str:
        return (self.NOW - timedelta(days=days_ago)).isoformat().replace(
            "+00:00", "Z"
        )

    def _record(self, **kwargs) -> dict:
        return _record_minimal(**kwargs)

    def test_empty(self):
        out = agg.compute_drift_summary([], now=self.NOW)
        self.assertIn("сессий нет", out)

    def test_only_old_records_treated_as_empty(self):
        records = [
            self._record(session_id="s1", ts_end=self._ts(days_ago=10)),
            self._record(session_id="s2", ts_end=self._ts(days_ago=30)),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("сессий нет", out)

    def test_fresh_records_no_drift(self):
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=2),
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="s2",
                ts_end=self._ts(days_ago=5),
                personal_thanks_emitted=False,
                user_feedback_baseline_source="list",
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Сессий за 7 дней: 2", out)
        self.assertIn("С `personal_thanks_emitted = true`: 1/2", out)
        self.assertIn("Дрейф `user_feedback_baseline_source`: нет", out)
        self.assertNotIn("⚠️", out)

    def test_drift_detected(self):
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=1),
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="s2",
                ts_end=self._ts(days_ago=2),
                user_feedback_baseline_source="unknown",
            ),
            self._record(
                session_id="s3",
                ts_end=self._ts(days_ago=3),
                user_feedback_baseline_source="typo-x",
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("⚠️", out)
        self.assertIn("Дрейф `user_feedback_baseline_source`: 2", out)
        self.assertIn("typo-x, unknown", out)

    def test_record_without_ts_field_skipped(self):
        records = [self._record(session_id="s1")]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("сессий нет", out)

    def test_malformed_ts_skipped(self):
        records = [self._record(session_id="s1", ts_end="garbage-not-iso")]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("сессий нет", out)

    def test_falls_back_to_ts_start_if_no_ts_end(self):
        records = [
            self._record(
                session_id="s1",
                ts_start=self._ts(days_ago=2),
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Сессий за 7 дней: 1", out)

    def test_auto_mode_excluded_from_drift(self):
        """adversarial /test --full не должны попадать в drift-сводку."""
        records = [
            self._record(
                session_id="real",
                ts_end=self._ts(days_ago=2),
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="auto",
                ts_end=self._ts(days_ago=1),
                user_feedback_baseline_source="search",
                auto_mode=True,
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Сессий за 7 дней: 1", out)


class ComputeRuleContributionsTest(unittest.TestCase):
    """Тесты для compute_rule_contributions_summary — секция в /fbAnalyzer digest."""

    NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)

    def _ts(self, days_ago: float) -> str:
        return (self.NOW - timedelta(days=days_ago)).isoformat().replace(
            "+00:00", "Z"
        )

    def _record(self, **kwargs) -> dict:
        return _record_minimal(**kwargs)

    def test_empty_no_records(self):
        out = agg.compute_rule_contributions_summary([], now=self.NOW)
        self.assertEqual(out, "—\n")

    def test_only_old_records_ignored(self):
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=30),
                designer_login="alice",
                rule_contributions=[
                    {"component": "X", "slug": "x", "hint": "old", "ts": self._ts(30)}
                ],
            )
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertEqual(out, "—\n")

    def test_auto_mode_excluded_from_rule_contributions(self):
        """adversarial /test --full не должны попадать в вклады дизайнеров."""
        records = [
            self._record(
                session_id="real",
                ts_end=self._ts(days_ago=2),
                designer_login="alice",
                rule_contributions=[
                    {"component": "X", "slug": "x", "hint": "real", "ts": self._ts(2)}
                ],
            ),
            self._record(
                session_id="auto",
                ts_end=self._ts(days_ago=1),
                designer_login="alice",
                auto_mode=True,
                rule_contributions=[
                    {"component": "X", "slug": "x", "hint": "synthetic", "ts": self._ts(1)}
                ],
            ),
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertIn("real", out)
        self.assertNotIn("synthetic", out)

    def test_no_contribution_filtered(self):
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=2),
                designer_login="alice",
                rule_contributions=[
                    {"component": "X", "slug": "x", "hint": "<no contribution>", "ts": self._ts(2)}
                ],
            )
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertEqual(out, "—\n")

    def test_single_contribution(self):
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=2),
                designer_login="alice",
                rule_contributions=[
                    {"component": "tabsView ❖ scrollview", "slug": "tabsview-scrollview",
                     "hint": "для табов с категориями", "ts": self._ts(2)}
                ],
            )
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertIn("tabsView ❖ scrollview", out)
        self.assertIn("@alice", out)
        self.assertIn("для табов с категориями", out)
        self.assertNotIn("🔥", out)  # один дизайнер — не кандидат

    def test_multiple_designers_marked_as_candidate(self):
        records = [
            self._record(
                session_id="s1", ts_end=self._ts(days_ago=2), designer_login="alice",
                rule_contributions=[
                    {"component": "tabsView ❖ scrollview", "slug": "tabsview-scrollview",
                     "hint": "h1", "ts": self._ts(2)}
                ],
            ),
            self._record(
                session_id="s2", ts_end=self._ts(days_ago=1), designer_login="bob",
                rule_contributions=[
                    {"component": "tabsView ❖ scrollview", "slug": "tabsview-scrollview",
                     "hint": "h2", "ts": self._ts(1)}
                ],
            ),
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertIn("🔥", out)  # ≥2 дизайнеров
        self.assertIn("≥2 дизайнеров", out)

    def test_grouping_by_slug_sorted_alphabetically(self):
        records = [
            self._record(
                session_id="s1", ts_end=self._ts(days_ago=2), designer_login="alice",
                rule_contributions=[
                    {"component": "Z-comp", "slug": "z-comp", "hint": "z1", "ts": self._ts(2)},
                    {"component": "A-comp", "slug": "a-comp", "hint": "a1", "ts": self._ts(2)},
                ],
            ),
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertLess(out.index("a-comp"), out.index("z-comp"))

    def test_rule_contributions_null_handled(self):
        """`rule_contributions: null` (а не `[]`) — не падать."""
        records = [
            self._record(session_id="s1", ts_end=self._ts(days_ago=2), rule_contributions=None)
        ]
        out = agg.compute_rule_contributions_summary(records, window_days=7, now=self.NOW)
        self.assertEqual(out, "—\n")

    def test_pluralization_russian(self):
        """Корректное согласование «вклад / вклада / вкладов»."""
        self.assertEqual(agg._plural_vklad(1), "вклад")
        self.assertEqual(agg._plural_vklad(2), "вклада")
        self.assertEqual(agg._plural_vklad(4), "вклада")
        self.assertEqual(agg._plural_vklad(5), "вкладов")
        self.assertEqual(agg._plural_vklad(11), "вкладов")  # exception
        self.assertEqual(agg._plural_vklad(12), "вкладов")  # exception
        self.assertEqual(agg._plural_vklad(14), "вкладов")  # exception
        self.assertEqual(agg._plural_vklad(21), "вклад")
        self.assertEqual(agg._plural_vklad(22), "вклада")
        self.assertEqual(agg._plural_vklad(100), "вкладов")
        self.assertEqual(agg._plural_vklad(0), "вкладов")

    def test_window_boundary(self):
        """Запись ровно на границе окна — учитывается (≤, не <)."""
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=7),
                user_feedback_baseline_source="search",
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Сессий за 7 дней: 1", out)

    def test_null_baseline_source_in_window_not_drift(self):
        """`None` в `baseline_source` — известное значение, не дрейф."""
        records = [
            self._record(
                session_id="s1",
                ts_end=self._ts(days_ago=2),
                user_feedback_baseline_source=None,
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Дрейф `user_feedback_baseline_source`: нет", out)
        self.assertNotIn("⚠️", out)

    def test_mixed_window_partial_inclusion(self):
        """Часть записей в окне, часть вне — только в-окне попадает."""
        records = [
            self._record(
                session_id="s_in",
                ts_end=self._ts(days_ago=3),
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
            self._record(
                session_id="s_out",
                ts_end=self._ts(days_ago=14),
                personal_thanks_emitted=True,
                user_feedback_baseline_source="search",
            ),
        ]
        out = agg.compute_drift_summary(records, window_days=7, now=self.NOW)
        self.assertIn("Сессий за 7 дней: 1", out)
        self.assertIn("С `personal_thanks_emitted = true`: 1/1", out)


class TestComputeDivergenceIssues(unittest.TestCase):
    """Тесты для compute_divergence_issues — экстрактор кандидатов для
    /fbAnalyzer Шаг 2.5 (auto:bug:divergence-* / auto:bug:structural-gap)
    из rule_contributions[] real-session телеметрии. См. issue #265."""

    def test_empty_records(self):
        self.assertEqual(agg.compute_divergence_issues([]), [])

    def test_usage_hint_excluded(self):
        """type='usage-hint' исключается — только digest summary."""
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "usage-hint", "slug": "navbar", "hint": "test"}
            ]
        }]
        self.assertEqual(agg.compute_divergence_issues(records), [])

    def test_structural_gap_included(self):
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "structural-gap", "slug": "button",
                 "slotProp": "icon#1", "path": ["button"]}
            ]
        }]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["label"], "auto:bug:structural-gap")
        self.assertEqual(out[0]["type"], "structural-gap")
        self.assertEqual(out[0]["divergence_step"], "")

    def test_divergence_forgotten_text_labeled(self):
        """divergence_step='forgotten_text' → auto:bug:divergence-text."""
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "divergence", "slug": "navbar",
                 "slotProp": "middle#1", "path": ["navbar"],
                 "divergence_step": "forgotten_text"}
            ]
        }]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["label"], "auto:bug:divergence-text")

    def test_divergence_unresolvable_force(self):
        """divergence_step='unresolvable_force' → auto:bug:divergence-unresolvable-force."""
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "divergence", "slug": "meshok-down",
                 "slotProp": "systemComponent#1", "path": ["meshok-down"],
                 "divergence_step": "unresolvable_force"}
            ]
        }]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["label"], "auto:bug:divergence-unresolvable-force")

    def test_dedup_within_session(self):
        """Дубль (slug, slotProp, path, step) в одной session — оставляем 1."""
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "divergence", "slug": "navbar",
                 "slotProp": "middle#1", "path": ["navbar"],
                 "divergence_step": "forgotten_text"},
                {"type": "divergence", "slug": "navbar",
                 "slotProp": "middle#1", "path": ["navbar"],
                 "divergence_step": "forgotten_text"},  # dupe
            ]
        }]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 1)

    def test_cross_session_NOT_deduped(self):
        """Same divergence в разных session_id → 2 кандидата.
        Cross-session dedup делает /fbAnalyzer через GitHub search."""
        records = [
            {"session_id": "s1", "rule_contributions": [
                {"type": "divergence", "slug": "navbar",
                 "slotProp": "middle#1", "path": ["navbar"],
                 "divergence_step": "forgotten_text"}
            ]},
            {"session_id": "s2", "rule_contributions": [
                {"type": "divergence", "slug": "navbar",
                 "slotProp": "middle#1", "path": ["navbar"],
                 "divergence_step": "forgotten_text"}
            ]},
        ]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 2)
        self.assertNotEqual(out[0]["dedup_key"], out[1]["dedup_key"])

    def test_null_rule_contributions_safe(self):
        records = [{"session_id": "s1", "rule_contributions": None}]
        self.assertEqual(agg.compute_divergence_issues(records), [])

    def test_missing_session_id_skipped(self):
        records = [{"rule_contributions": [
            {"type": "structural-gap", "slug": "button"}
        ]}]
        self.assertEqual(agg.compute_divergence_issues(records), [])

    def test_unknown_divergence_step_fallback(self):
        """Неизвестный divergence_step → label fallback на divergence-unknown."""
        records = [{
            "session_id": "s1",
            "rule_contributions": [
                {"type": "divergence", "slug": "x", "slotProp": "y",
                 "path": ["x"], "divergence_step": "totally_new_step"}
            ]
        }]
        out = agg.compute_divergence_issues(records)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["label"], "auto:bug:divergence-unknown")


if __name__ == "__main__":
    unittest.main(verbosity=2)
