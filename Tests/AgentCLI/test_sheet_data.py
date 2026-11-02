"""Data-edit regression coverage; run against a freshly built HANX_BIN."""
import json
import unittest
import test_spreadsheets as fixtures


class SheetData(unittest.TestCase):
    setUp = fixtures.Spreadsheets.setUp
    tearDown = fixtures.Spreadsheets.tearDown
    runcli = fixtures.Spreadsheets.runcli
    create = fixtures.Spreadsheets.create
    edit = fixtures.Spreadsheets.edit
    cells = fixtures.Spreadsheets.cells

    def test_sort_stable_computed_header_bounded_formulas_and_styles(self):
        p = self.create({'kind': 'spreadsheet', 'sheets': [{'name': 'Data', 'rows': [
            ['name', 'key', 'formula', 'outside'], ['second', '=1+1', '=B2+$E$1', 'fixed2'],
            ['first', 1, '=B3+$E$1', 'fixed3'], ['tie', 2, '=B4+$E$1', 'fixed4'],
            ['blank', None, '=B5+$E$1', 'fixed5']],
            'cells': {'A3': {'value': 'first', 'style': {'bold': True}}, 'E1': 10}}]})
        out = self.edit(p, [{'op': 'sort_range', 'range': 'A1:C5', 'keyColumn': 'B', 'header': True}])
        c = self.cells(out, 'Data', 'A1:D5')
        self.assertEqual([c[f'A{i}']['value'] for i in range(1, 6)], ['name', 'first', 'second', 'tie', 'blank'])
        self.assertTrue(c['A2']['style']['bold'])
        self.assertEqual(c['C2']['input'], '=B2+$E$1')
        self.assertEqual(c['D2']['value'], 'fixed2')
        desc = self.edit(p, [{'op': 'sort_range', 'range': 'A2:C5', 'keyColumn': 'B', 'ascending': False}], out='desc.xlsx')
        d = self.cells(desc, 'Data', 'A2:A5')
        self.assertEqual([d[f'A{i}']['value'] for i in range(2, 6)], ['second', 'tie', 'first', 'blank'])
        self.assertEqual(self.cells(p, 'Data', 'A2')['A2']['value'], 'second')

    def test_fill_down_right_translates_mixed_and_quoted_refs_and_clears(self):
        p = self.create({'kind': 'spreadsheet', 'sheets': [{'name': 'Data', 'cells': {
            'A1': {'input': "='Other A1'!B1+$B1+B$1+$B$1", 'style': {'bold': True}},
            'B2': {'value': 'erase', 'style': {'italic': True}},
            'B3': 'erase'}}, {'name': 'Other A1', 'cells': {'B1': 1, 'B2': 2}}]})
        out = self.edit(p, [{'op': 'fill_range', 'range': 'A1:B3', 'direction': 'down'}])
        c = self.cells(out, 'Data', 'A1:B3')
        self.assertEqual(c['A3']['input'], "='Other A1'!B3+$B3+B$1+$B$1")
        self.assertTrue(c['A3']['style']['bold'])
        self.assertEqual(c['B2']['type'], 'empty')
        self.assertFalse(c['B2']['style']['italic'])
        right = self.edit(p, [{'op': 'fill_range', 'range': 'A1:C1', 'direction': 'right'}], out='right.xlsx')
        self.assertEqual(self.cells(right, 'Data', 'C1')['C1']['input'], "='Other A1'!D1+$B1+D$1+$B$1")

    def test_copied_older_excel_formula_retains_implicit_intersection(self):
        p = self.root / 'legacy.json'
        spec = {'kind': 'spreadsheet', 'sheets': [{'name': 'Data', 'cells': {
            'A1': 2, 'A2': 3, 'B1': '=A1+1'
        }, 'legacyFormulas': ['B1']}]}
        self.runcli('create', '--spec', '-', '--output', p, stdin=json.dumps(spec))
        out = self.edit(p, [{'op': 'fill_range', 'range': 'B1:B2', 'direction': 'down'}], out='filled.json')
        sheet = self.runcli('read', out)['model']['sheets'][0]
        self.assertEqual(set(sheet['legacyFormulas']), {'B1', 'B2'})
        self.assertEqual(sheet['cells']['B2']['input'], '=A2+1')

    def test_chart_edit_changes_only_requested_properties(self):
        source = self.create({'kind': 'spreadsheet', 'sheets': [{
            'name': 'Data', 'rows': [['Month', 'Sales'], ['Jan', 3], ['Feb', '=B2*2']]
        }]})
        chart = {'kind': 'column', 'title': 'Original', 'range': 'A1:B3', 'x': 32, 'y': 40,
                 'width': 320, 'height': 160}
        added = self.edit(source, [{'op': 'add_chart', 'value': chart}])
        get = lambda file: self.runcli('read', file)['model']['sheets'][0]['charts']
        actual = get(added)[0]
        self.assertEqual(actual['kind'], 'column')
        changed = self.edit(added, [{'op': 'update_chart', 'index': 0,
                                     'value': {'title': 'Updated', 'kind': 'line'}}], out='changed.xlsx')
        self.assertEqual(get(changed), [dict(actual, title='Updated', kind='line')])
        self.assertEqual(self.cells(changed, 'Data', 'B3')['B3']['value'], 6)
        before = changed.read_bytes()
        for op in [{'op': 'delete_chart', 'index': 9},
                   {'op': 'update_chart', 'index': 0, 'value': {'width': -1}},
                   {'op': 'add_chart', 'value': dict(chart, kind='unknown')}]:
            bad = self.edit(changed, [op], out='bad-chart.xlsx', ok=False)
            self.assertFalse(bad.exists())
            self.assertEqual(before, changed.read_bytes())
        removed = self.edit(changed, [{'op': 'delete_chart', 'index': 0}], out='removed.xlsx')
        self.assertEqual(get(removed), [])
        self.assertEqual(get(source), [])

    def test_reject_merged_spill_and_invalid_parameters_atomically(self):
        cases = [
            {'merges': ['A1:B2'], 'cells': {'A1': 1}},
            {'cells': {'A1': '=SEQUENCE(3,3)'}},
            {'cells': {'A1': '=SEQUENCE(3,3)', 'B2': 'blocked'}},
        ]
        for index, sheet in enumerate(cases):
            with self.subTest(index=index):
                (self.root / '매출.xlsx').unlink(missing_ok=True)
                p = self.create({'kind': 'spreadsheet', 'sheets': [dict(name='Data', **sheet)]})
                before = p.read_bytes()
                for op in [{'op': 'sort_range', 'range': 'B2:C3', 'keyColumn': 'B'},
                           {'op': 'fill_range', 'range': 'B2:C3', 'direction': 'right'}]:
                    out = self.edit(p, [op], out='rejected.xlsx', ok=False)
                    self.assertFalse(out.exists())
                    self.assertEqual(p.read_bytes(), before)
        (self.root / '매출.xlsx').unlink(missing_ok=True)
        p = self.create()
        for op in [
            {'op': 'sort_range', 'range': 'A1:B3', 'keyColumn': 'C'},
            {'op': 'sort_range', 'range': 'A1:B3', 'keyColumn': 'A', 'ascending': 'yes'},
            {'op': 'sort_range', 'range': 'A1:B3', 'keyColumn': 'A', 'header': 1},
            {'op': 'fill_range', 'range': 'A1:B3', 'direction': 'left'},
            {'op': 'fill_range', 'range': 'A1:B3', 'direction': 'down', 'typo': 1},
        ]:
            self.edit(p, [op], out='invalid.xlsx', ok=False)
        capabilities = self.runcli('capabilities')['operations']['spreadsheet']
        self.assertIn('sort_range', capabilities)
        self.assertIn('fill_range', capabilities)


if __name__ == '__main__':
    unittest.main()
