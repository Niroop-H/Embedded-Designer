import unittest
from copy import deepcopy
from app.engine.mutator import TopologyMutator

class MutationIntegrityTests(unittest.TestCase):
    def base(self):
        return {'components':[{'ref':'U1','type':'mcu'},{'ref':'R8','type':'resistor'},{'ref':'D4','type':'led'}],
                'nets':[{'name':'GND_RAIL','connections':['U1.GND']}],
                'pinmap':[{'pinNumber':'5','function':'SPI'}]}

    def test_collision_rolls_back_without_input_mutation(self):
        t=self.base();before=deepcopy(t)
        updated,delta,_=TopologyMutator.apply_mutation(t,'add LED GPIO5')
        self.assertEqual(delta['status'],'REJECTED')
        self.assertEqual(updated,before)
        self.assertEqual(t,before)

    def test_led_has_series_resistor_and_ground(self):
        t=self.base();before=deepcopy(t)
        updated,delta,_=TopologyMutator.apply_mutation(t,'add LED GPIO6')
        self.assertEqual(delta['status'],'APPLIED_DRAFT')
        self.assertEqual(t,before)
        refs={c['ref'] for c in updated['components']}
        self.assertIn('R9',refs);self.assertIn('D5',refs)
        endpoints=[ep for n in updated['nets'] for ep in n['connections']]
        self.assertIn('R9.2',endpoints);self.assertIn('D5.A',endpoints);self.assertIn('D5.K',endpoints)

    def test_remove_charger_never_guesses_regulator(self):
        t=self.base();t['components'].append({'ref':'U2','type':'regulator'})
        updated,delta,_=TopologyMutator.apply_mutation(t,'remove battery charger')
        self.assertEqual(delta['status'],'REJECTED');self.assertEqual(updated,t)

    def test_unsupported_command_is_explicit(self):
        t=self.base();updated,delta,_=TopologyMutator.apply_mutation(t,'make it perfect')
        self.assertEqual(delta['status'],'REJECTED');self.assertEqual(updated,t)
