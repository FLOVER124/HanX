from contextlib import closing
import hashlib
from pathlib import Path
import unittest
import pypdfium2 as pdf
import test_worker


def sizes(path):
    with pdf.PdfDocument(path) as doc:
        return [(tuple(round(v) for v in doc[i].get_size()), doc[i].get_rotation()) for i in range(len(doc))]


def page_text(path, index):
    with pdf.PdfDocument(path) as doc:
        page = doc[index]
        with closing(page.get_textpage()) as text:
            return text.get_text_range()


class PDFPageOperationTests(unittest.TestCase):
    setUp = test_worker.PDFEditorTests.setUp
    tearDown = test_worker.PDFEditorTests.tearDown
    run_worker = test_worker.PDFEditorTests.run_worker
    ok = test_worker.PDFEditorTests.ok

    def edit(self, name, operations, **args):
        out = self.dir / name
        result = self.ok('edit', output=str(out), operations=operations, **args)
        self.assertEqual(result['pageCount'], len(sizes(out)))
        self.assertEqual(self.source.read_bytes(), self.original)
        return out

    def test_rotation_accumulates_clockwise_and_keeps_objects(self):
        out = self.edit('rotated.pdf', [{'op': 'rotate_page', 'page': 0, 'rotation': 90}, {'op': 'rotate_page', 'page': 0, 'rotation': 180}, {'op': 'rotate_page', 'page': 1, 'rotation': -90}])
        # Sizes are reported as displayed, so a quarter turn swaps them.
        self.assertEqual(sizes(out), [((500, 400), 270), ((300, 200), 270)])
        self.assertIn('Original text', page_text(out, 0))
        self.assertEqual(len(self.ok('inspect', input=str(out), page=0)['objects']), 3)
        self.assertFalse(self.run_worker('edit', output=str(self.dir / 'bad.pdf'), operations=[{'op': 'rotate_page', 'page': 0, 'rotation': 45}])['ok'])

    def test_sequential_structure_operations(self):
        out = self.edit('structure.pdf', [
            {'op': 'insert_blank_page', 'at': 0, 'width': 100, 'height': 120},
            {'op': 'duplicate_page', 'page': 1},
            {'op': 'move_page', 'page': 3, 'to': 0},
            {'op': 'insert_blank_page'},
        ])
        # The moved small page leads; the appended blank page uses the last page's size.
        self.assertEqual([s for s, _ in sizes(out)], [(200, 300), (100, 120), (400, 500), (400, 500), (400, 500)])
        self.assertIn('Original text', page_text(out, 2))
        self.assertIn('Original text', page_text(out, 3))
        self.assertEqual(page_text(out, 4).strip(), '')

    def test_duplicated_page_is_independent(self):
        copy = self.edit('copy.pdf', [{'op': 'duplicate_page', 'page': 0}])
        edited = self.dir / 'copy-edited.pdf'
        self.ok('edit', input=str(copy), output=str(edited), operations=[{'op': 'set_text', 'page': 1, 'object': 0, 'text': 'Original'}])
        self.assertIn('Original text', page_text(edited, 0))
        self.assertNotIn('Original text', page_text(edited, 1))

    def test_delete_page_keeps_one_page(self):
        out = self.edit('deleted.pdf', [{'op': 'delete_page', 'page': 0}])
        self.assertEqual(sizes(out), [((200, 300), 0)])
        bad = self.dir / 'empty.pdf'
        result = self.run_worker('edit', input=str(out), output=str(bad), operations=[{'op': 'delete_page', 'page': 0}])
        self.assertFalse(result['ok']); self.assertFalse(bad.exists())

    def test_import_selected_pages_from_another_pdf(self):
        other = self.dir / '다른 문서.pdf'
        with pdf.PdfDocument.new() as doc:
            for width in (111, 222, 333): doc.new_page(width, 400)
            doc.save(other)
        out = self.edit('imported.pdf', [{'op': 'import_pages', 'source': str(other), 'pages': [2, 0], 'at': 1}, {'op': 'import_pages', 'source': str(other)}])
        self.assertEqual([s[0] for s, _ in sizes(out)], [400, 333, 111, 200, 111, 222, 333])
        for operation in [{'op': 'import_pages', 'source': str(other), 'pages': [3]}, {'op': 'import_pages', 'source': str(self.dir / 'missing.pdf')}, {'op': 'import_pages', 'source': str(other), 'at': 9}]:
            target = self.dir / 'invalid-import.pdf'
            result = self.run_worker('edit', output=str(target), operations=[operation])
            self.assertFalse(result['ok'], operation); self.assertFalse(target.exists())

    def test_page_and_object_operations_are_separate_atomic_batches(self):
        target = self.dir / 'mixed.pdf'
        result = self.run_worker('edit', output=str(target), operations=[{'op': 'rotate_page', 'page': 0}, {'op': 'delete', 'page': 0, 'object': 0}])
        self.assertFalse(result['ok']); self.assertFalse(target.exists())
        result = self.run_worker('edit', output=str(target), operations=[{'op': 'rotate_page', 'page': 0}, {'op': 'move_page', 'page': 0, 'to': 5}])
        self.assertFalse(result['ok']); self.assertFalse(target.exists())
        stale = self.run_worker('edit', output=str(target), revision=hashlib.sha256(b'other').hexdigest(), operations=[{'op': 'delete_page', 'page': 0}])
        self.assertFalse(stale['ok']); self.assertFalse(target.exists())
        self.assertEqual(self.source.read_bytes(), self.original)


if __name__ == '__main__':
    unittest.main()
