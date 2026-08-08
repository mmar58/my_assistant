<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  
  export let models: any[] = [];
  export let selectedModel: string = "";

  let selectedValue = selectedModel 
    ? { value: selectedModel, label: selectedModel } 
    : undefined;

  function handleSelect(item: { value: string, label: string } | undefined) {
    if (item) {
      selectedModel = item.value;
    }
  }
</script>

<div class="w-[280px]">
  <Select.Root selected={selectedValue} onSelectedChange={handleSelect}>
    <Select.Trigger>
      <Select.Value placeholder="Select a model" />
    </Select.Trigger>
    <Select.Content>
      <Select.Group>
        <Select.Label>Ollama Models</Select.Label>
        {#each models as model}
          <Select.Item value={model.name} label={model.name}>
            {model.name}
          </Select.Item>
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
</div>
