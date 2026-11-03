"""Structural edits through the same CLI operation used by the portable GUI."""
import json
import unittest
import test_spreadsheets as fixtures


class SheetStructure(unittest.TestCase):
    setUp = fixtures.Spreadsheets.setUp
    tearDown = fixtures.Spreadsheets.tearDown
    runcli = fixtures.Spreadsheets.runcli
    edit = fixtures.Spreadsheets.edit

    def model(self, spec):
        path = self.root / 'source.json'
        self.runcli('create', '--spec', '-', '--output', path, stdin=json.dumps(spec))
        return path

    def test_delete_row_repairs_dependents_metadata_and_names(self):
        target = "Bob's A1"
        qualifier = "'Bob''s A1'!"
        source = self.model({'kind': 'spreadsheet', 'definedNames': {'BLOCK': qualifier + '$A$2:$A$4'},
                             'sheets': [{'name': target, 'cells': {
                                 'A1': 1, 'A2': 2, 'A3': 3, 'C4': '=Other!A2+A$3'},
                                 'legacyFormulas': ['C4'], 'frozenRows': 3, 'merges': ['A2:B4'],
                                 'rowHeights': {'2': 40, '3': 52}, 'charts': [
                                     {'kind': 'line', 'range': 'A1:A4'}]},
                                 {'name': 'Other', 'cells': {
                                     'A1': '=A2+' + qualifier + '$A$2',
                                     'B1': '=SUM(' + qualifier + '$A$4:$A$2)&"A2"'}}]})
        out = self.edit(source, [{'op': 'delete_row', 'sheet': target, 'cell': 'Z2'}], out='out.json')
        model = self.runcli('read', out)['model']
        first, second = model['sheets']
        self.assertEqual(first['cells']['A2']['input'], '3')
        self.assertEqual(first['cells']['C3']['input'], '=Other!A2+A$2')
        self.assertEqual(first['legacyFormulas'], ['C3'])
        self.assertEqual(first['frozenRows'], 2)
        self.assertEqual(first['rowHeights'], {'2': 52})
        self.assertEqual(first['charts'][0]['range'], 'A1:A3')
        self.assertEqual(first['merges'], ['A2:B3'])
        self.assertEqual(model['definedNames']['BLOCK'], qualifier + '$A$2:$A$3')
        self.assertEqual(second['cells']['A1']['input'], '=A2+#REF!')
        self.assertEqual(second['cells']['B1']['input'], '=SUM(' + qualifier + '$A$3:$A$2)&"A2"')

    def test_insert_column_and_delete_column(self):
        source = self.model({'kind': 'spreadsheet', 'sheets': [{'name': 'Data', 'frozenCols': 2,
            'columnWidths': {'B': 80}, 'cells': {'A1': '=COLUMNS($A:$B)+LOG10(100)+C$2', 'B2': 10}}]})
        out = self.edit(source, [{'op': 'insert_column', 'cell': 'B99'}], out='insert.json')
        sheet = self.runcli('read', out)['model']['sheets'][0]
        self.assertEqual(sheet['cells']['C2']['input'], '10')
        self.assertEqual(sheet['cells']['A1']['input'], '=COLUMNS($A:$C)+LOG10(100)+D$2')
        self.assertEqual(sheet['columnWidths'], {'C': 80})
        self.assertEqual(sheet['frozenCols'], 3)
        restored = self.edit(out, [{'op': 'delete_column', 'cell': 'B1'}], out='restored.json')
        self.assertEqual(self.runcli('read', restored)['model'], self.runcli('read', source)['model'])

    def test_insert_row_xlsx_expands_reference_and_recalculates(self):
        source = self.model({'kind': 'spreadsheet', 'sheets': [
            {'name': 'Data', 'cells': {'A1': 2, 'A2': 3, 'B1': '=SUM(A1:$A$2)'}},
            {'name': 'Other', 'cells': {'A1': '=Data!$A2', 'B1': '=A2'}}]})
        out = self.edit(source, [{'op': 'insert_row', 'sheet': 'Data', 'cell': 'A2'}], out='out.xlsx')
        cells = fixtures.Spreadsheets.cells(self, out, 'Data', 'A1:B3')
        self.assertEqual(cells['A2']['type'], 'empty')
        self.assertEqual(cells['B1']['input'], '=SUM(A1:$A$3)')
        self.assertEqual(cells['B1']['value'], 5)
        other = fixtures.Spreadsheets.cells(self, out, 'Other', 'A1:B1')
        self.assertEqual(other['A1']['input'], '=Data!$A3')
        self.assertEqual(other['A1']['value'], 3)
        self.assertEqual(other['B1']['input'], '=A2')

    def test_unsupported_formula_rejected_without_publishing(self):
        source = self.model({'kind': 'spreadsheet', 'sheets': [
            {'name': 'Data', 'cells': {'A1': 1}}, {'name': 'Other', 'cells': {'A1': '=SUM(Table1[Sales])'}}]})
        before = source.read_bytes()
        out = self.edit(source, [{'op': 'insert_row', 'cell': 'A1'}], out='fail.json', ok=False)
        self.assertFalse(out.exists())
        self.assertEqual(source.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
