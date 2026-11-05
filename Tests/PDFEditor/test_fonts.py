import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'Tools/pdf'))
from fonts import score,normalized
class FontMatchingTests(unittest.TestCase):
 def test_subset_family_normalization(self):self.assertEqual(normalized('ABCDEF+Family-Bold'),normalized('Family Bold'))
 def test_family_and_weight_rank_over_generic(self):
  original={'name':'ABCDEF+Example-Bold','family':'Example','weight':700,'italic':False}
  def item(name,weight):return dict(names=[name],weight=weight,width=5,italic=False,serif=False)
  self.assertGreater(score(item('Example-Bold',700),original),score(item('Generic',400),original))
  self.assertGreater(score(item('Example-Bold',700),original),score(item('Example-Light',300),original))
